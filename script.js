document.addEventListener('DOMContentLoaded', function() {
    // Canvas setup
    const canvas = document.getElementById('simulationCanvas');
    const ctx = canvas.getContext('2d');
    const simulationContainer = document.querySelector('.simulation-container');
    
    // Resize canvas to fit container
    function resizeCanvas() {
        canvas.width = simulationContainer.clientWidth;
        canvas.height = simulationContainer.clientHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // DOM elements
    const addOrganismsBtn = document.getElementById('addOrganisms');
    const resetSimulationBtn = document.getElementById('resetSimulation');
    const togglePauseBtn = document.getElementById('togglePause');
    const organismTypeSelect = document.getElementById('organismType');
    const organismCountInput = document.getElementById('organismCount');
    
    // Population limits
    const maxPlantsInput = document.getElementById('maxPlants');
    const maxHerbivoresInput = document.getElementById('maxHerbivores');
    const maxCarnivoresInput = document.getElementById('maxCarnivores');
    const maxOmnivoresInput = document.getElementById('maxOmnivores');
    
    // Stats elements
    const plantCountSpan = document.getElementById('plantCount');
    const herbivoreCountSpan = document.getElementById('herbivoreCount');
    const carnivoreCountSpan = document.getElementById('carnivoreCount');
    const omnivoreCountSpan = document.getElementById('omnivoreCount');
    const cycleCountSpan = document.getElementById('cycleCount');
    const totalCountSpan = document.getElementById('totalCount');
    const avgEnergySpan = document.getElementById('avgEnergy');
    const fpsCounterSpan = document.getElementById('fpsCounter');
    
    // Simulation state
    let organisms = [];
    let isPaused = false;
    let cycle = 0;
    let animationFrameId = null;
    let lastTime = 0;
    let fps = 0;
    let frameCount = 0;
    let lastFpsUpdate = 0;
    
    // Configuration
    const CONFIG = {
        MAX_UPDATES_PER_SECOND: 30,  // Logic updates per second
        MAX_ENTITIES: 2000,          // Absolute maximum entities
        GRID_SIZE: 100,              // Spatial partitioning cell size
        PLANT_GROWTH_RATE: 0.02      // Chance for new plant to spawn each frame
    };
    
    // Energy parameters
    const ENERGY = {
        PLANT_GAIN: 0.1,
        HERBIVORE_GAIN: 15,
        CARNIVORE_GAIN: 25,
        OMNIVORE_PLANT_GAIN: 10,
        OMNIVORE_MEAT_GAIN: 20,
        MOVE_COST: 0.1,
        BASE_COST: 0.05,
        REPRODUCE_COST: 30,
        START_ENERGY: 50
    };
    
    // Colors for rendering
    const COLORS = {
        plant: '#4CAF50',
        herbivore: '#2196F3',
        carnivore: '#f44336',
        omnivore: '#9C27B0',
        linkPlantHerbivore: 'rgba(0, 255, 0, 0.2)',
        linkPredator: 'rgba(255, 0, 0, 0.2)',
        linkDefault: 'rgba(0, 0, 0, 0.1)'
    };
    
    // Spatial partitioning grid
    let grid = {};
    
    // Timing for decoupled update/render
    let lastUpdateTime = 0;
    const updateInterval = 1000 / CONFIG.MAX_UPDATES_PER_SECOND;
    
    // Initialize the simulation
    init();
    
    function init() {
        // Add some initial organisms
        addOrganisms('plant', 50);
        addOrganisms('herbivore', 20);
        addOrganisms('carnivore', 5);
        addOrganisms('omnivore', 5);
        
        startSimulation();
    }
    
    function startSimulation() {
        if (!animationFrameId) {
            lastTime = performance.now();
            lastUpdateTime = lastTime;
            lastFpsUpdate = lastTime;
            update();
        }
    }
    
    function stopSimulation() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
    }
    
    function update(currentTime) {
        animationFrameId = requestAnimationFrame(update);
        
        // Calculate delta time and FPS
        const deltaTime = currentTime - lastTime;
        lastTime = currentTime;
        
        // Update FPS counter every second
        frameCount++;
        if (currentTime - lastFpsUpdate >= 1000) {
            fps = Math.round((frameCount * 1000) / (currentTime - lastFpsUpdate));
            fpsCounterSpan.textContent = fps;
            frameCount = 0;
            lastFpsUpdate = currentTime;
        }
        
        // Always render, but only update logic at fixed intervals
        render();
        
        if (!isPaused) {
            // Update logic at fixed time steps
            const updateCount = Math.floor((currentTime - lastUpdateTime) / updateInterval);
            
            if (updateCount > 0) {
                // Cap the number of updates to prevent spiral of death
                const maxUpdates = 5;
                const updatesToRun = Math.min(updateCount, maxUpdates);
                
                for (let i = 0; i < updatesToRun; i++) {
                    simulate(updateInterval / 1000); // Convert to seconds
                    lastUpdateTime += updateInterval;
                }
                
                // If we're running behind, skip some updates
                if (updateCount > maxUpdates) {
                    lastUpdateTime = currentTime - updateInterval;
                }
            }
        }
    }
    
    function simulate(deltaTime) {
        // Update cycle counter
        cycle++;
        
        // Update spatial grid
        updateSpatialGrid();
        
        // Process plants first (growth)
        organisms.forEach(organism => {
            if (organism.type === 'plant') {
                organism.energy += ENERGY.PLANT_GAIN * deltaTime * 60; // Normalize to ~60fps
            }
        });
        
        // Process movement and energy for all organisms
        organisms.forEach(organism => {
            if (organism.type !== 'plant') {
                // Random direction changes
                if (Math.random() < 0.02 * deltaTime * 60) {
                    organism.dx = (Math.random() - 0.5) * organism.speed;
                    organism.dy = (Math.random() - 0.5) * organism.speed;
                }
                
                // Move organism
                organism.x += organism.dx * deltaTime * 60;
                organism.y += organism.dy * deltaTime * 60;
                
                // Boundary checking
                if (organism.x < 0) {
                    organism.x = 0;
                    organism.dx *= -1;
                } else if (organism.x > canvas.width - organism.size) {
                    organism.x = canvas.width - organism.size;
                    organism.dx *= -1;
                }
                
                if (organism.y < 0) {
                    organism.y = 0;
                    organism.dy *= -1;
                } else if (organism.y > canvas.height - organism.size) {
                    organism.y = canvas.height - organism.size;
                    organism.dy *= -1;
                }
                
                // Energy cost for moving
                organism.energy -= ENERGY.MOVE_COST * deltaTime * 60;
            }
            
            // Base energy cost
            organism.energy -= ENERGY.BASE_COST * deltaTime * 60;
            
            // Update digestion timer if exists
            if (organism.digesting !== undefined && organism.digesting > 0) {
                organism.digesting -= deltaTime * 60;
            }
        });
        
        // Handle feeding and reproduction
        processFeeding();
        processReproduction();
        
        // Random plant growth (if below max)
        if (Math.random() < CONFIG.PLANT_GROWTH_RATE * deltaTime * 60) {
            const currentPlants = organisms.filter(o => o.type === 'plant').length;
            const maxPlants = parseInt(maxPlantsInput.value);
            
            if (currentPlants < maxPlants && organisms.length < CONFIG.MAX_ENTITIES) {
                addOrganisms('plant', 1, true);
            }
        }
        
        // Remove dead organisms
        organisms = organisms.filter(organism => organism.energy > 0);
        
        // Update stats every few cycles
        if (cycle % 10 === 0) {
            updateStats();
        }
    }
    
    function updateSpatialGrid() {
        grid = {};
        organisms.forEach(org => {
            const gridX = Math.floor(org.x / CONFIG.GRID_SIZE);
            const gridY = Math.floor(org.y / CONFIG.GRID_SIZE);
            const key = `${gridX},${gridY}`;
            if (!grid[key]) grid[key] = [];
            grid[key].push(org);
        });
    }
    
    function processFeeding() {
        // Herbivores eat plants
        organisms.filter(o => o.type === 'herbivore').forEach(herbivore => {
            if ((herbivore.digesting === undefined || herbivore.digesting <= 0) && 
                herbivore.energy < ENERGY.START_ENERGY * 1.5) {
                
                const nearbyPlant = findNearbyOrganism(herbivore, 'plant', herbivore.size + 10);
                
                if (nearbyPlant) {
                    herbivore.energy += ENERGY.HERBIVORE_GAIN;
                    nearbyPlant.energy = 0;
                    herbivore.digesting = 5;
                    herbivore.eatingTimer = 10; // For visual effect
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
                    carnivore.eatingTimer = 10;
                }
            }
        });
        
        // Omnivores eat both plants and animals
        organisms.filter(o => o.type === 'omnivore').forEach(omnivore => {
            if (omnivore.energy < ENERGY.START_ENERGY * 0.75 && 
                (omnivore.digesting === undefined || omnivore.digesting <= 0)) {
                
                const nearbyHerbivore = findNearbyOrganism(omnivore, 'herbivore', omnivore.size + 5);
                
                if (nearbyHerbivore) {
                    omnivore.energy += ENERGY.OMNIVORE_MEAT_GAIN;
                    nearbyHerbivore.energy -= ENERGY.OMNIVORE_MEAT_GAIN * 2;
                    omnivore.digesting = 10;
                    omnivore.eatingTimer = 10;
                } else {
                    const nearbyPlant = findNearbyOrganism(omnivore, 'plant', omnivore.size + 5);
                    
                    if (nearbyPlant) {
                        omnivore.energy += ENERGY.OMNIVORE_PLANT_GAIN;
                        nearbyPlant.energy -= ENERGY.OMNIVORE_PLANT_GAIN * 2;
                        omnivore.digesting = 10;
                        omnivore.eatingTimer = 10;
                    }
                }
            }
        });
    }
    
    function findNearbyOrganism(organism, type, maxDistance) {
        const gridX = Math.floor(organism.x / CONFIG.GRID_SIZE);
        const gridY = Math.floor(organism.y / CONFIG.GRID_SIZE);
        
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
            // Check population limits
            const currentCount = organisms.filter(o => o.type === organism.type).length;
            let maxCount;
            
            switch (organism.type) {
                case 'plant': maxCount = parseInt(maxPlantsInput.value); break;
                case 'herbivore': maxCount = parseInt(maxHerbivoresInput.value); break;
                case 'carnivore': maxCount = parseInt(maxCarnivoresInput.value); break;
                case 'omnivore': maxCount = parseInt(maxOmnivoresInput.value); break;
                default: maxCount = Infinity;
            }
            
            if (organism.energy > ENERGY.REPRODUCE_COST && 
                Math.random() < 0.01 && 
                currentCount < maxCount &&
                organisms.length < CONFIG.MAX_ENTITIES) {
                
                organism.energy -= ENERGY.REPRODUCE_COST;
                
                const offspring = {
                    type: organism.type,
                    x: organism.x + (Math.random() * 20 - 10),
                    y: organism.y + (Math.random() * 20 - 10),
                    dx: (Math.random() - 0.5) * organism.speed,
                    dy: (Math.random() - 0.5) * organism.speed,
                    size: organism.size,
                    speed: organism.speed,
                    energy: ENERGY.REPRODUCE_COST,
                    birthTime: performance.now()
                };
                
                // Position within bounds
                offspring.x = Math.max(0, Math.min(canvas.width - offspring.size, offspring.x));
                offspring.y = Math.max(0, Math.min(canvas.height - offspring.size, offspring.y));
                
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
    
    function render() {
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw links between nearby organisms
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
                                    drawLink(org1, org2);
                                }
                            });
                        }
                    }
                }
            });
        }
        
        // Draw organisms
        organisms.forEach(organism => {
            // Calculate size based on energy and eating state
            let size = organism.size;
            if (organism.eatingTimer > 0) {
                size *= 1.3;
                organism.eatingTimer--;
            }
            
            // Calculate opacity based on energy
            const energyRatio = organism.energy / ENERGY.START_ENERGY;
            const opacity = Math.min(1, Math.max(0.3, energyRatio));
            
            // Draw organism
            ctx.globalAlpha = opacity;
            ctx.fillStyle = COLORS[organism.type];
            
            // High energy glow
            if (organism.energy > ENERGY.START_ENERGY * 1.5) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = COLORS[organism.type];
            }
            
            ctx.beginPath();
            ctx.arc(
                organism.x + organism.size/2,
                organism.y + organism.size/2,
                size/2,
                0,
                Math.PI * 2
            );
            ctx.fill();
            
            // Reset shadow
            ctx.shadowBlur = 0;
            
            // Pop-in animation for new organisms
            if (performance.now() - organism.birthTime < 500) {
                const progress = (performance.now() - organism.birthTime) / 500;
                const scale = progress < 0.5 ? 
                    progress * 2 * 1.2 : 
                    1.2 - ((progress - 0.5) * 2 * 0.2);
                
                ctx.save();
                ctx.translate(
                    organism.x + organism.size/2,
                    organism.y + organism.size/2
                );
                ctx.scale(scale, scale);
                ctx.translate(
                    -(organism.x + organism.size/2),
                    -(organism.y + organism.size/2)
                );
                ctx.fill();
                ctx.restore();
            }
        });
    }
    
    function drawLink(org1, org2) {
        const distance = getDistance(org1, org2);
        const angle = Math.atan2(org2.y - org1.y, org2.x - org1.x);
        
        // Different link color based on relationship
        if ((org1.type === 'herbivore' && org2.type === 'plant') || 
            (org2.type === 'herbivore' && org1.type === 'plant')) {
            ctx.strokeStyle = COLORS.linkPlantHerbivore;
        } else if ((org1.type === 'carnivore' && (org2.type === 'herbivore' || org2.type === 'omnivore')) || 
                 (org2.type === 'carnivore' && (org1.type === 'herbivore' || org1.type === 'omnivore'))) {
            ctx.strokeStyle = COLORS.linkPredator;
        } else {
            ctx.strokeStyle = COLORS.linkDefault;
        }
        
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(org1.x + org1.size/2, org1.y + org1.size/2);
        ctx.lineTo(org2.x + org2.size/2, org2.y + org2.size/2);
        ctx.stroke();
    }
    
    function addOrganisms(type, count, silent = false) {
        // Check population limits
        const currentCount = organisms.filter(o => o.type === type).length;
        let maxCount;
        
        switch (type) {
            case 'plant': maxCount = parseInt(maxPlantsInput.value); break;
            case 'herbivore': maxCount = parseInt(maxHerbivoresInput.value); break;
            case 'carnivore': maxCount = parseInt(maxCarnivoresInput.value); break;
            case 'omnivore': maxCount = parseInt(maxOmnivoresInput.value); break;
            default: maxCount = Infinity;
        }
        
        // Don't exceed max entities
        const availableSlots = Math.min(maxCount - currentCount, CONFIG.MAX_ENTITIES - organisms.length);
        const actualCount = Math.min(count, availableSlots);
        
        if (actualCount <= 0) return;
        
        for (let i = 0; i < actualCount; i++) {
            const size = type === 'plant' ? 10 : 15;
            const speed = type === 'plant' ? 0 : 
                         type === 'herbivore' ? 0.8 : 
                         type === 'carnivore' ? 1.2 : 1.0;
            
            const organism = {
                type: type,
                x: Math.random() * (canvas.width - size),
                y: Math.random() * (canvas.height - size),
                dx: type === 'plant' ? 0 : (Math.random() - 0.5) * speed,
                dy: type === 'plant' ? 0 : (Math.random() - 0.5) * speed,
                size: size,
                speed: speed,
                energy: ENERGY.START_ENERGY,
                birthTime: performance.now()
            };
            
            organisms.push(organism);
        }
        
        if (!silent) {
            updateStats();
        }
    }
    
    function resetSimulation() {
        stopSimulation();
        organisms = [];
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
});
