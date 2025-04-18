document.addEventListener('DOMContentLoaded', function() {
    const simulationArea = document.getElementById('simulationArea');
    const addOrganismsBtn = document.getElementById('addOrganisms');
    const resetSimulationBtn = document.getElementById('resetSimulation');
    const togglePauseBtn = document.getElementById('togglePause');
    const organismTypeSelect = document.getElementById('organismType');
    const organismCountInput = document.getElementById('organismCount');
    
    const plantCountSpan = document.getElementById('plantCount');
    const herbivoreCountSpan = document.getElementById('herbivoreCount');
    const carnivoreCountSpan = document.getElementById('carnivoreCount');
    const omnivoreCountSpan = document.getElementById('omnivoreCount');
    const cycleCountSpan = document.getElementById('cycleCount');
    const totalCountSpan = document.getElementById('totalCount');
    const avgEnergySpan = document.getElementById('avgEnergy');
    
    let organisms = [];
    let links = [];
    let isPaused = false;
    let cycle = 0;
    let animationFrameId = null;
    
    // Spatial partitioning grid
    const GRID_SIZE = 100;
    let grid = {};
    
    // Energy parameters
    const ENERGY = {
        PLANT_GAIN: 0.1,       // Energy plants gain per cycle
        HERBIVORE_GAIN: 15,     // Energy from eating a plant
        CARNIVORE_GAIN: 25,     // Energy from eating a herbivore
        OMNIVORE_PLANT_GAIN: 10, // Energy omnivore gets from plants
        OMNIVORE_MEAT_GAIN: 20,  // Energy omnivore gets from animals
        MOVE_COST: 0.1,        // Energy cost to move
        BASE_COST: 0.05,       // Base energy cost per cycle
        REPRODUCE_COST: 30,     // Energy needed to reproduce
        START_ENERGY: 50        // Starting energy for new organisms
    };
    
    // Initialize the simulation
    init();
    
    function init() {
        updateStats();
        startSimulation();
    }
    
    function startSimulation() {
        if (!animationFrameId) {
            update();
        }
    }
    
    function stopSimulation() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }
    
    function update() {
        if (!isPaused) {
            updateSpatialGrid();
            simulate();
            cycle++;
            updateStats();
        }
        animationFrameId = requestAnimationFrame(update);
    }
    
    function updateSpatialGrid() {
        grid = {};
        organisms.forEach(org => {
            const gridX = Math.floor(org.x / GRID_SIZE);
            const gridY = Math.floor(org.y / GRID_SIZE);
            const key = `${gridX},${gridY}`;
            if (!grid[key]) grid[key] = [];
            grid[key].push(org);
        });
    }
    
    function simulate() {
        // Process plants first (growth)
        organisms.forEach(organism => {
            if (organism.type === 'plant') {
                organism.energy += ENERGY.PLANT_GAIN;
            }
        });
        
        // Process movement and energy for all organisms
        organisms.forEach(organism => {
            if (organism.type !== 'plant') {
                // Random direction changes
                if (Math.random() < 0.02) {
                    organism.dx = (Math.random() - 0.5) * organism.speed;
                    organism.dy = (Math.random() - 0.5) * organism.speed;
                }
                
                // Move organism
                organism.x += organism.dx;
                organism.y += organism.dy;
                
                // Boundary checking
                if (organism.x < 0) {
                    organism.x = 0;
                    organism.dx *= -1;
                } else if (organism.x > simulationArea.offsetWidth - organism.size) {
                    organism.x = simulationArea.offsetWidth - organism.size;
                    organism.dx *= -1;
                }
                
                if (organism.y < 0) {
                    organism.y = 0;
                    organism.dy *= -1;
                } else if (organism.y > simulationArea.offsetHeight - organism.size) {
                    organism.y = simulationArea.offsetHeight - organism.size;
                    organism.dy *= -1;
                }
                
                // Energy cost for moving
                organism.energy -= ENERGY.MOVE_COST;
            }
            
            // Base energy cost
            organism.energy -= ENERGY.BASE_COST;
            
            // Update DOM element position
            organism.element.style.left = `${organism.x}px`;
            organism.element.style.top = `${organism.y}px`;
            
            // Update opacity based on energy level (visual feedback)
            const energyRatio = organism.energy / ENERGY.START_ENERGY;
            organism.element.style.opacity = Math.min(1, Math.max(0.3, energyRatio));
            
            // Highlight high-energy organisms
            organism.element.classList.toggle('high-energy', organism.energy > ENERGY.START_ENERGY * 1.5);
            
            // Update digestion timer if exists
            if (organism.digesting !== undefined && organism.digesting > 0) {
                organism.digesting--;
            }
        });
        
        // Handle feeding and reproduction
        processFeeding();
        processReproduction();
        
        // Remove dead organisms
        organisms = organisms.filter(organism => {
            if (organism.energy <= 0) {
                if (organism.element && organism.element.parentNode) {
                    organism.element.parentNode.removeChild(organism.element);
                }
                return false;
            }
            return true;
        });
        
        // Update links between organisms
        updateLinks();
    }
    
function processFeeding() {
    // Herbivores eat plants - made more aggressive
    organisms.filter(o => o.type === 'herbivore').forEach(herbivore => {
        // Remove energy threshold - herbivores will always eat when they can
        if ((herbivore.digesting === undefined || herbivore.digesting <= 0) && 
            herbivore.energy < ENERGY.START_ENERGY * 1.5) {  // But don't eat when already full
            
            const nearbyPlant = findNearbyOrganism(herbivore, 'plant', herbivore.size + 10);  // Increased detection range
            
            if (nearbyPlant) {
                herbivore.energy += ENERGY.HERBIVORE_GAIN;
                // Completely remove the plant instead of just reducing energy
                nearbyPlant.energy = 0;  // This will cause it to be removed in cleanup
                herbivore.digesting = 5;  // Reduced from 10 to eat more frequently
                
                // Visual feedback - make herbivore "grow" briefly when eating
                herbivore.element.classList.add('eating');
                setTimeout(() => herbivore.element.classList.remove('eating'), 300);
            }
        }
    });
        
        // Carnivores eat herbivores
        organisms.filter(o => o.type === 'carnivore').forEach(carnivore => {
            if (carnivore.energy < ENERGY.START_ENERGY * 0.75 && 
                (carnivore.digesting === undefined || carnivore.digesting <= 0)) {
                
                const nearbyHerbivore = findNearbyOrganism(carnivore, 'herbivore', carnivore.size + 5) || 
                                      findNearbyOrganism(carnivore, 'omnivore', carnivore.size + 5);
                
                if (nearbyHerbivore) {
                    carnivore.energy += ENERGY.CARNIVORE_GAIN;
                    nearbyHerbivore.energy -= ENERGY.CARNIVORE_GAIN * 2;
                    carnivore.digesting = 10;
                }
            }
        });
        
        // Omnivores eat both plants and animals
        organisms.filter(o => o.type === 'omnivore').forEach(omnivore => {
            if (omnivore.energy < ENERGY.START_ENERGY * 0.75 && 
                (omnivore.digesting === undefined || omnivore.digesting <= 0)) {
                
                // Try to find nearby herbivore first (prefer meat)
                const nearbyHerbivore = findNearbyOrganism(omnivore, 'herbivore', omnivore.size + 5);
                
                if (nearbyHerbivore) {
                    omnivore.energy += ENERGY.OMNIVORE_MEAT_GAIN;
                    nearbyHerbivore.energy -= ENERGY.OMNIVORE_MEAT_GAIN * 2;
                    omnivore.digesting = 10;
                } else {
                    // If no herbivores, look for plants
                    const nearbyPlant = findNearbyOrganism(omnivore, 'plant', omnivore.size + 5);
                    
                    if (nearbyPlant) {
                        omnivore.energy += ENERGY.OMNIVORE_PLANT_GAIN;
                        nearbyPlant.energy -= ENERGY.OMNIVORE_PLANT_GAIN * 2;
                        omnivore.digesting = 10;
                    }
                }
            }
        });
    }
    
    function findNearbyOrganism(organism, type, maxDistance) {
        const gridX = Math.floor(organism.x / GRID_SIZE);
        const gridY = Math.floor(organism.y / GRID_SIZE);
        
        // Check current and adjacent grid cells
        for (let x = gridX - 1; x <= gridX + 1; x++) {
            for (let y = gridY - 1; y <= gridY + 1; y++) {
                const key = `${x},${y}`;
                if (grid[key]) {
                    const found = grid[key].find(org => 
                        org.type === type && 
                        org !== organism &&
                        getDistance(organism, org) < maxDistance
                    );
                    if (found) return found;
                }
            }
        }
        return null;
    }
    
    function processReproduction() {
        const newOrganisms = [];
        
        organisms.forEach(organism => {
            if (organism.energy > ENERGY.REPRODUCE_COST && Math.random() < 0.01) {
                // Deduct reproduction cost
                organism.energy -= ENERGY.REPRODUCE_COST;
                
                // Create offspring
                const offspring = {
                    type: organism.type,
                    x: organism.x + (Math.random() * 20 - 10),
                    y: organism.y + (Math.random() * 20 - 10),
                    dx: (Math.random() - 0.5) * organism.speed,
                    dy: (Math.random() - 0.5) * organism.speed,
                    size: organism.size,
                    speed: organism.speed,
                    energy: ENERGY.REPRODUCE_COST,
                    element: document.createElement('div')
                };
                
                // Position within bounds
                offspring.x = Math.max(0, Math.min(simulationArea.offsetWidth - offspring.size, offspring.x));
                offspring.y = Math.max(0, Math.min(simulationArea.offsetHeight - offspring.size, offspring.y));
                
                offspring.element.className = `organism ${organism.type} pop-in`;
                offspring.element.style.width = `${offspring.size}px`;
                offspring.element.style.height = `${offspring.size}px`;
                offspring.element.style.left = `${offspring.x}px`;
                offspring.element.style.top = `${offspring.y}px`;
                
                setTimeout(() => {
                    offspring.element.classList.remove('pop-in');
                }, 500);
                
                simulationArea.appendChild(offspring.element);
                newOrganisms.push(offspring);
            }
        });
        
        organisms = organisms.concat(newOrganisms);
    }
    
    function getDistance(org1, org2) {
        const dx = org2.x - org1.x;
        const dy = org2.y - org1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    function updateLinks() {
        // Clear existing links
        links.forEach(link => {
            if (link.element && link.element.parentNode) {
                link.element.parentNode.removeChild(link.element);
            }
        });
        links = [];
        
        // Create new links between nearby organisms using spatial grid
        for (let x in grid) {
            grid[x].forEach(org1 => {
                const [gridX, gridY] = x.split(',').map(Number);
                
                // Check current and adjacent grid cells
                for (let i = gridX - 1; i <= gridX + 1; i++) {
                    for (let j = gridY - 1; j <= gridY + 1; j++) {
                        const key = `${i},${j}`;
                        if (grid[key]) {
                            grid[key].forEach(org2 => {
                                if (org1 !== org2 && getDistance(org1, org2) < 100) {
                                    createLink(org1, org2);
                                }
                            });
                        }
                    }
                }
            });
        }
    }
    
    function createLink(org1, org2) {
        const linkElement = document.createElement('div');
        linkElement.className = 'link';
        
        const distance = getDistance(org1, org2);
        const angle = Math.atan2(org2.y - org1.y, org2.x - org1.x);
        
        linkElement.style.width = `${distance}px`;
        linkElement.style.left = `${org1.x + org1.size/2}px`;
        linkElement.style.top = `${org1.y + org1.size/2}px`;
        linkElement.style.transform = `rotate(${angle}rad)`;
        
        // Different link color based on relationship
        if ((org1.type === 'herbivore' && org2.type === 'plant') || 
            (org2.type === 'herbivore' && org1.type === 'plant')) {
            linkElement.style.backgroundColor = 'rgba(0, 255, 0, 0.2)';
        } else if ((org1.type === 'carnivore' && (org2.type === 'herbivore' || org2.type === 'omnivore')) || 
                   (org2.type === 'carnivore' && (org1.type === 'herbivore' || org1.type === 'omnivore'))) {
            linkElement.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
        } else {
            linkElement.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
        }
        
        simulationArea.appendChild(linkElement);
        
        links.push({
            element: linkElement,
            org1: org1,
            org2: org2
        });
    }
    
    function addOrganisms(type, count) {
        for (let i = 0; i < count; i++) {
            const size = type === 'plant' ? 10 : 15;
            const speed = type === 'plant' ? 0 : 
                         type === 'herbivore' ? 0.8 : 
                         type === 'carnivore' ? 1.2 : 1.0;
            
            const organism = {
                type: type,
                x: Math.random() * (simulationArea.offsetWidth - size),
                y: Math.random() * (simulationArea.offsetHeight - size),
                dx: type === 'plant' ? 0 : (Math.random() - 0.5) * speed,
                dy: type === 'plant' ? 0 : (Math.random() - 0.5) * speed,
                size: size,
                speed: speed,
                energy: ENERGY.START_ENERGY,
                element: document.createElement('div')
            };
            
            organism.element.className = `organism ${type} pop-in`;
            organism.element.style.width = `${size}px`;
            organism.element.style.height = `${size}px`;
            organism.element.style.left = `${organism.x}px`;
            organism.element.style.top = `${organism.y}px`;
            
            setTimeout(() => {
                organism.element.classList.remove('pop-in');
            }, 500);
            
            simulationArea.appendChild(organism.element);
            organisms.push(organism);
        }
        updateStats();
    }
    
    function resetSimulation() {
        stopSimulation();
        
        // Remove all organisms and links from DOM
        organisms.forEach(organism => {
            if (organism.element && organism.element.parentNode) {
                organism.element.parentNode.removeChild(organism.element);
            }
        });
        
        links.forEach(link => {
            if (link.element && link.element.parentNode) {
                link.element.parentNode.removeChild(link.element);
            }
        });
        
        organisms = [];
        links = [];
        cycle = 0;
        
        updateStats();
        startSimulation();
    }
    
    function updateStats() {
        const plants = organisms.filter(o => o.type === 'plant').length;
        const herbivores = organisms.filter(o => o.type === 'herbivore').length;
        const carnivores = organisms.filter(o => o.type === 'carnivore').length;
        const omnivores = organisms.filter(o => o.type === 'omnivore').length;
        const total = plants + herbivores + carnivores + omnivores;
        const avgEnergy = total > 0 ? organisms.reduce((sum, org) => sum + org.energy, 0) / total : 0;
        
        plantCountSpan.textContent = plants;
        herbivoreCountSpan.textContent = herbivores;
        carnivoreCountSpan.textContent = carnivores;
        omnivoreCountSpan.textContent = omnivores;
        cycleCountSpan.textContent = cycle;
        totalCountSpan.textContent = total;
        avgEnergySpan.textContent = avgEnergy.toFixed(1);
    }
    
    // Event listeners
    addOrganismsBtn.addEventListener('click', function() {
        const type = organismTypeSelect.value;
        const count = parseInt(organismCountInput.value);
        addOrganisms(type, count);
    });
    
    resetSimulationBtn.addEventListener('click', resetSimulation);
    
    togglePauseBtn.addEventListener('click', function() {
        isPaused = !isPaused;
        togglePauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
    });
    
    // Handle window resize
    window.addEventListener('resize', function() {
        // Keep organisms within bounds
        organisms.forEach(organism => {
            if (organism.x > simulationArea.offsetWidth - organism.size) {
                organism.x = simulationArea.offsetWidth - organism.size;
            }
            if (organism.y > simulationArea.offsetHeight - organism.size) {
                organism.y = simulationArea.offsetHeight - organism.size;
            }
            organism.element.style.left = `${organism.x}px`;
            organism.element.style.top = `${organism.y}px`;
        });
    });
});