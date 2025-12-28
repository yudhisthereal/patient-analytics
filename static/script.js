// script.js - Multi-Camera Analytics Dashboard

// DOM Elements
const streamImg = document.getElementById('stream');
const toggleRecord = document.getElementById('toggleRecord');
const toggleRaw = document.getElementById('toggleRaw');
const autoUpdateBg = document.getElementById('autoUpdateBg');
const showSafeArea = document.getElementById('showSafeArea');
const useSafetyCheck = document.getElementById('useSafetyCheck');
const setBackgroundBtn = document.getElementById('setBackgroundBtn');
const editSafeAreaBtn = document.getElementById('editSafeAreaBtn');
const fallAlgorithmSelect = document.getElementById('fallAlgorithmSelect');

// Popup elements
const popup = document.getElementById('popup');
const preview = document.getElementById('preview');
const safeAreaPopup = document.getElementById('safeAreaPopup');

// Safe Area Editor Elements
const safeAreaCanvas = document.getElementById('safeAreaCanvas');
const newPolygonBtn = document.getElementById('newPolygonBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const saveSafeAreasBtn = document.getElementById('saveSafeAreasBtn');
const saveStatus = document.getElementById('saveStatus');

// Safe Area Editor State
let safeAreas = [];
let currentPolygon = [];
let isEditing = false;
let canvasContext = null;
let backgroundImage = null;
let originalImageWidth = 0;
let originalImageHeight = 0;
let canvasScale = 1;

// Camera selection
let currentCameraId = "maixcam_001";

// Analytics server URL (current server)
let ANALYTICS_HTTP_URL = window.location.origin;

// Stream state
let streamRefreshInterval = null;
const REFRESH_INTERVAL_MS = 200; // 5 FPS
let errorCount = 0;
const MAX_ERRORS = 10;

// Connection state
let isConnected = false;
let lastUpdateTime = null;
let cameraStateTimer = null;
let cameraListTimer = null;
let cameraStatusTimer = null;

// Multi-camera state
let availableCameras = [];
let cameraConnectionStatus = {};

// Status elements (will be created dynamically)
let statusIndicator = null;
let cameraSelect = null;
let cameraInfoSpan = null;
let refreshCamerasBtn = null;

// Camera registration state
let pendingRegistrations = [];
let selectedTempId = null;

// ============================================
// UI SETUP - CREATE DYNAMIC ELEMENTS
// ============================================

function setupDynamicUI() {
    // Create camera selection container
    const cameraContainer = document.createElement('div');
    cameraContainer.id = 'cameraControls';
    cameraContainer.style.cssText = `
        margin: 15px 0;
        padding: 10px;
        background: #f5f5f5;
        border-radius: 5px;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
    `;
    
    // Create camera select
    const cameraLabel = document.createElement('label');
    cameraLabel.textContent = '📷 Camera: ';
    cameraLabel.style.cssText = 'font-weight: bold; margin-right: 5px;';
    
    cameraSelect = document.createElement('select');
    cameraSelect.id = 'cameraSelect';
    cameraSelect.style.cssText = 'padding: 5px 10px; border-radius: 4px; border: 1px solid #ccc;';
    cameraSelect.innerHTML = '<option value="maixcam_001">Camera 1</option>';
    
    refreshCamerasBtn = document.createElement('button');
    refreshCamerasBtn.textContent = '🔄 Refresh List';
    refreshCamerasBtn.style.cssText = 'padding: 5px 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;';
    refreshCamerasBtn.onclick = loadCameraList;
    
    cameraInfoSpan = document.createElement('span');
    cameraInfoSpan.id = 'camera-info';
    cameraInfoSpan.style.cssText = 'font-size: 13px; color: #666; margin-left: 10px;';
    cameraInfoSpan.textContent = 'Loading...';
    
    cameraContainer.appendChild(cameraLabel);
    cameraContainer.appendChild(cameraSelect);
    cameraContainer.appendChild(refreshCamerasBtn);
    cameraContainer.appendChild(cameraInfoSpan);
    
    // Create status indicator
    statusIndicator = document.createElement('div');
    statusIndicator.id = 'stream-status';
    statusIndicator.style.cssText = `
        position: fixed;
        top: 10px;
        right: 10px;
        padding: 8px 12px;
        border-radius: 4px;
        font-size: 12px;
        z-index: 1000;
        background: #777;
        color: white;
        font-weight: bold;
        min-width: 160px;
        text-align: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    `;
    statusIndicator.textContent = `Camera: ${currentCameraId}`;
    
    // Create status panel
    const statusPanel = document.createElement('div');
    statusPanel.id = 'statusPanel';
    statusPanel.style.cssText = `
        margin: 15px 0;
        padding: 12px;
        background: #e9ecef;
        border-radius: 5px;
        border: 1px solid #dee2e6;
        font-size: 13px;
    `;
    
    const statusGrid = document.createElement('div');
    statusGrid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;';
    
    const statusItems = [
        { id: 'serverStatus', label: 'Server Status', value: 'Connecting...' },
        { id: 'cameraStatus', label: 'Camera Status', value: 'Unknown' },
        { id: 'connectedCamera', label: 'Active Camera', value: currentCameraId },
        { id: 'lastUpdate', label: 'Last Frame', value: 'Never' }
    ];
    
    statusItems.forEach(item => {
        const statusItem = document.createElement('div');
        const label = document.createElement('strong');
        label.textContent = `${item.label}: `;
        label.style.marginRight = '5px';
        
        const value = document.createElement('span');
        value.id = item.id;
        value.textContent = item.value;
        
        statusItem.appendChild(label);
        statusItem.appendChild(value);
        statusGrid.appendChild(statusItem);
    });
    
    statusPanel.appendChild(statusGrid);
    
    // Insert elements into DOM
    const h1 = document.querySelector('h1');
    if (h1 && h1.nextSibling) {
        h1.parentNode.insertBefore(cameraContainer, h1.nextSibling);
        cameraContainer.parentNode.insertBefore(statusPanel, cameraContainer.nextSibling);
    } else {
        document.body.insertBefore(cameraContainer, document.body.firstChild);
        document.body.insertBefore(statusPanel, cameraContainer.nextSibling);
    }
    
    document.body.appendChild(statusIndicator);
    
    // Set up camera select event
    cameraSelect.onchange = () => {
        currentCameraId = cameraSelect.value;
        console.log(`Switched to camera: ${currentCameraId}`);
        
        // Check connection status for this camera
        const cameraInfo = availableCameras.find(cam => cam.camera_id === currentCameraId);
        updateConnectionStatus(currentCameraId, cameraInfo?.online || false);
        
        // Update active camera display
        const connectedCameraElement = document.getElementById('connectedCamera');
        if (connectedCameraElement) {
            connectedCameraElement.textContent = currentCameraId;
        }
        
        // Restart stream with new camera
        startStream();
        
        // Load new camera's state
        fetchCameraState(currentCameraId);
        
        // Update safe areas for new camera
        loadSafeAreasForCamera(currentCameraId);
    };
}

function setupRegistrationUI() {
    const registrationBtn = document.createElement('button');
    registrationBtn.id = 'registrationBtn';
    registrationBtn.innerHTML = 'Register New Camera';
    registrationBtn.onclick = showRegistrationPopup;
    
    const cameraControls = document.getElementById('cameraControls');
    if (cameraControls) {
        cameraControls.appendChild(registrationBtn);
    }
}


// ============================================
// STREAM FUNCTIONS - SIMPLE AUTO-REFRESH
// ============================================

function updateConnectionStatus(cameraId, connected, ageSeconds = null) {
    cameraConnectionStatus[cameraId] = {
        connected: connected,
        lastUpdate: new Date(),
        ageSeconds: ageSeconds
    };
    
    // Update current camera status if it's this camera
    if (cameraId === currentCameraId) {
        const statusText = connected ? 'Connected' : 'Disconnected';
        
        statusIndicator.textContent = `${cameraId}: ${statusText}`;
        
        // Remove all status classes and add the appropriate one
        statusIndicator.className = '';
        if (connected) {
            statusIndicator.classList.add('connected');
        } else {
            statusIndicator.classList.add('disconnected');
        }
        
        // Also update camera status in status panel
        const cameraStatusElement = document.getElementById('cameraStatus');
        if (cameraStatusElement) {
            cameraStatusElement.textContent = statusText;
            cameraStatusElement.style.color = connected ? '#4CAF50' : '#ff4444';
        }
        
        // Update isConnected flag
        isConnected = connected;
        
        // Update UI controls based on connection
        updateUIControls({}); // Will disable/enable based on isConnected
    }
}

async function checkCameraConnection(cameraId) {
    try {
        const response = await fetch(`${ANALYTICS_HTTP_URL}/camera_status?camera_id=${cameraId}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            updateConnectionStatus(cameraId, data.connected, data.age_seconds);
            return data.connected;
        }
        updateConnectionStatus(cameraId, false);
        return false;
    } catch (error) {
        console.error(`Error checking connection for ${cameraId}:`, error);
        updateConnectionStatus(cameraId, false);
        return false;
    }
}

function startStream() {
    stopStream(); // Clear any existing refresh
    
    if (streamImg) {
        console.log(`Starting auto-refresh stream for ${currentCameraId} at ${REFRESH_INTERVAL_MS}ms interval`);
        
        // Check connection status first
        checkCameraConnection(currentCameraId);
        
        // Initial load
        refreshStreamImage();
        
        // Set up auto-refresh
        streamRefreshInterval = setInterval(refreshStreamImage, REFRESH_INTERVAL_MS);
    }
}

function stopStream() {
    if (streamRefreshInterval) {
        clearInterval(streamRefreshInterval);
        streamRefreshInterval = null;
    }
    if (streamImg) {
        streamImg.src = '';
    }
}

function refreshStreamImage() {
    if (!streamImg) return;
    
    // Add timestamp to prevent caching
    const timestamp = Date.now();
    const streamUrl = `${ANALYTICS_HTTP_URL}/stream.jpg?camera_id=${currentCameraId}&t=${timestamp}`;
    
    // Update last update time
    lastUpdateTime = new Date();
    updateLastUpdateDisplay();
    
    // Set image source
    streamImg.src = streamUrl;
    
    // Update status on successful load
    streamImg.onload = function() {
        errorCount = 0;
        updateLastUpdateDisplay();
        
        // Check if this is a placeholder (camera disconnected)
        // We can't directly detect placeholder, but we check connection status
        checkCameraConnection(currentCameraId);
    };
    
    // Handle errors
    streamImg.onerror = function() {
        errorCount++;
        console.error(`Stream error ${errorCount}/${MAX_ERRORS} for ${currentCameraId}`);
        
        // Mark as disconnected
        updateConnectionStatus(currentCameraId, false);
        
        if (errorCount >= MAX_ERRORS) {
            console.error('Too many stream errors, trying to recover...');
            errorCount = 0;
            // Try to reload camera list and reconnect
            loadCameraList();
        }
    };
}

function updateLastUpdateDisplay() {
    const lastUpdateElement = document.getElementById('lastUpdate');
    if (lastUpdateElement && lastUpdateTime) {
        const now = new Date();
        const diff = Math.floor((now - lastUpdateTime) / 1000);
        
        if (diff < 60) {
            lastUpdateElement.textContent = `${diff} seconds ago`;
            lastUpdateElement.style.color = diff < 5 ? '#4CAF50' : '#ff9800';
        } else {
            lastUpdateElement.textContent = lastUpdateTime.toLocaleTimeString();
            lastUpdateElement.style.color = '#777';
        }
    }
}

// ============================================
// CAMERA MANAGEMENT - MULTI-CAMERA SUPPORT
// ============================================

async function loadCameraList() {
    try {
        if (cameraInfoSpan) cameraInfoSpan.textContent = 'Loading cameras...';
        
        const response = await fetch(`${ANALYTICS_HTTP_URL}/camera_list`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            availableCameras = data.cameras || [];
            updateCameraSelect(availableCameras);
            
            if (cameraInfoSpan) {
                const connectedCount = data.connected_count || 0;
                cameraInfoSpan.textContent = `${connectedCount}/${data.count} camera(s) connected`;
                cameraInfoSpan.style.color = connectedCount > 0 ? '#4CAF50' : '#ff4444';
            }
            
            // Update server status
            const serverStatusElement = document.getElementById('serverStatus');
            if (serverStatusElement) {
                serverStatusElement.textContent = `Connected to ${ANALYTICS_HTTP_URL}`;
                serverStatusElement.style.color = '#4CAF50';
            }
            
            // Update connection status for all cameras
            availableCameras.forEach(camera => {
                updateConnectionStatus(camera.camera_id, camera.online, camera.age_seconds);
            });
            
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('Failed to load camera list:', error);
        if (cameraInfoSpan) {
            cameraInfoSpan.textContent = 'Connection error';
            cameraInfoSpan.style.color = '#ff4444';
        }
        
        const serverStatusElement = document.getElementById('serverStatus');
        if (serverStatusElement) {
            serverStatusElement.textContent = 'Connection error';
            serverStatusElement.style.color = '#ff4444';
        }
    }
}

function updateCameraSelect(cameras) {
    if (!cameraSelect) return;
    
    const currentValue = cameraSelect.value;
    
    // Clear and add placeholder
    cameraSelect.innerHTML = '<option value="" disabled>Select a camera</option>';
    
    if (!cameras || cameras.length === 0) {
        const option = document.createElement('option');
        option.value = "maixcam_001";
        option.textContent = "Camera 1 (offline)";
        cameraSelect.appendChild(option);
        cameraSelect.value = "maixcam_001";
        return;
    }
    
    // Add cameras with connection status
    cameras.forEach(camera => {
        const option = document.createElement('option');
        option.value = camera.camera_id;
        
        const timeAgo = Math.round(camera.age_seconds || 0);
        const status = camera.online ? '✓' : '✗';
        const statusText = camera.online ? 'Connected' : 'Disconnected';
        option.textContent = `${camera.camera_id} ${status} (${statusText}, ${timeAgo}s ago)`;
        
        // Color code based on connection status
        option.style.color = camera.online ? '#4CAF50' : '#ff4444';
        
        cameraSelect.appendChild(option);
    });
    
    // Keep current selection if possible
    if (currentValue && cameras.some(cam => cam.camera_id === currentValue)) {
        cameraSelect.value = currentValue;
        currentCameraId = currentValue;
    } else if (cameras.length > 0) {
        // Try to find a connected camera first
        const connectedCamera = cameras.find(cam => cam.online);
        if (connectedCamera) {
            cameraSelect.value = connectedCamera.camera_id;
            currentCameraId = connectedCamera.camera_id;
        } else {
            cameraSelect.value = cameras[0].camera_id;
            currentCameraId = cameras[0].camera_id;
        }
        updateConnectionStatus(currentCameraId, cameras.find(cam => cam.camera_id === currentCameraId)?.online || false);
    }
    
    // Update active camera display
    const connectedCameraElement = document.getElementById('connectedCamera');
    if (connectedCameraElement) {
        connectedCameraElement.textContent = currentCameraId;
    }
}

async function loadPendingRegistrations() {
    try {
        const response = await fetch(`${ANALYTICS_HTTP_URL}/pending_registrations`);
        if (response.ok) {
            const data = await response.json();
            pendingRegistrations = data.pending || [];
            return pendingRegistrations;
        }
    } catch (error) {
        console.error('Failed to load pending registrations:', error);
    }
    return [];
}


// ============================================
// CAMERA STATE & COMMANDS
// ============================================

async function fetchCameraState(cameraId) {
    try {
        const response = await fetch(`${ANALYTICS_HTTP_URL}/camera_state?camera_id=${cameraId}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (response.ok) {
            const flags = await response.json();
            updateUIControls(flags);
            
            // Update algorithm selection
            if (flags.fall_algorithm !== undefined) {
                updateAlgorithmSelection(flags.fall_algorithm, false);
            }
            
            // Update connection status from flags
            if (flags._connected !== undefined) {
                updateConnectionStatus(cameraId, flags._connected);
            }
            
            return flags;
        }
    } catch (error) {
        console.error(`Failed to fetch state for ${cameraId}:`, error);
    }
    return null;
}

function updateUIControls(flags) {
    if (!flags) return;
    
    // Update checkboxes only for actual control flags
    if (typeof flags.record === 'boolean') {
        toggleRecord.checked = flags.record;
        toggleRecord.disabled = !isConnected;
    }
    if (typeof flags.show_raw === 'boolean') {
        toggleRaw.checked = flags.show_raw;
        toggleRaw.disabled = !isConnected;
    }
    if (typeof flags.auto_update_bg === 'boolean') {
        autoUpdateBg.checked = flags.auto_update_bg;
        autoUpdateBg.disabled = !isConnected;
    }
    if (typeof flags.show_safe_area === 'boolean') {
        showSafeArea.checked = flags.show_safe_area;
        showSafeArea.disabled = !isConnected;
    }
    if (typeof flags.use_safety_check === 'boolean') {
        useSafetyCheck.checked = flags.use_safety_check;
        useSafetyCheck.disabled = !isConnected;
    }
    if (typeof flags.fall_algorithm === 'number') {
        fallAlgorithmSelect.value = flags.fall_algorithm;
        fallAlgorithmSelect.disabled = !isConnected;
    }
    
    // Disable/enable buttons based on connection
    setBackgroundBtn.disabled = !isConnected;
    editSafeAreaBtn.disabled = !isConnected;
    
    // Style disabled controls
    const styleDisabled = (element, disabled) => {
        if (disabled) {
            element.style.opacity = '0.6';
            element.style.cursor = 'not-allowed';
        } else {
            element.style.opacity = '1';
            element.style.cursor = 'pointer';
        }
    };
    
    styleDisabled(toggleRecord, !isConnected);
    styleDisabled(toggleRaw, !isConnected);
    styleDisabled(autoUpdateBg, !isConnected);
    styleDisabled(showSafeArea, !isConnected);
    styleDisabled(useSafetyCheck, !isConnected);
    styleDisabled(fallAlgorithmSelect, !isConnected);
    styleDisabled(setBackgroundBtn, !isConnected);
    styleDisabled(editSafeAreaBtn, !isConnected);
}

function sendCommand(command, value = null) {
    if (!isConnected) {
        console.warn(`Cannot send command to disconnected camera: ${currentCameraId}`);
        alert('Camera is disconnected. Please connect a camera first.');
        return;
    }
    
    console.log(`Sending command to ${currentCameraId}: ${command}=${value}`);
    
    fetch(`${ANALYTICS_HTTP_URL}/command`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            camera_id: currentCameraId,
            command: command,
            value: value
        })
    })
    .then(response => {
        if (response.ok) {
            console.log(`Command sent successfully`);
            // Update UI after a short delay
            setTimeout(() => fetchCameraState(currentCameraId), 300);
        } else {
            console.error(`Command failed: HTTP ${response.status}`);
            updateConnectionStatus(currentCameraId, false);
        }
    })
    .catch(error => {
        console.error('Command error:', error);
        updateConnectionStatus(currentCameraId, false);
    });
}

function updateAlgorithmSelection(algorithmValue, updateCamera = true) {
    // Convert to string for comparison
    const algorithmStr = algorithmValue.toString();
    
    // Update dropdown
    if (fallAlgorithmSelect) {
        fallAlgorithmSelect.value = algorithmStr;
    }
    
    // Update algorithm cards
    const algorithmCards = document.querySelectorAll('.card');
    algorithmCards.forEach(card => {
        if (card.dataset.algorithm === algorithmStr) {
            card.dataset.active = 'true';
        } else {
            delete card.dataset.active;
        }
    });
    
    // Send command to camera if requested
    if (updateCamera && isConnected && window.sendCommand) {
        console.log(`Setting fall algorithm to: ${algorithmStr}`);
        window.sendCommand("set_fall_algorithm", parseInt(algorithmStr));
    }
}

// ============================================
// EVENT HANDLERS
// ============================================

// Control button handlers
if (toggleRecord) {
    toggleRecord.onchange = () => {
        sendCommand("toggle_record", toggleRecord.checked);
    };
}

if (toggleRaw) {
    toggleRaw.onchange = () => {
        sendCommand("toggle_raw", toggleRaw.checked);
    };
}

if (autoUpdateBg) {
    autoUpdateBg.onchange = () => {
        sendCommand("auto_update_bg", autoUpdateBg.checked);
    };
}

if (showSafeArea) {
    showSafeArea.onchange = () => {
        sendCommand("toggle_safe_area_display", showSafeArea.checked);
    };
}

if (useSafetyCheck) {
    useSafetyCheck.onchange = () => {
        sendCommand("toggle_safety_check", useSafetyCheck.checked);
    };
}

if (setBackgroundBtn) {
    setBackgroundBtn.onclick = () => {
        if (preview && popup) {
            preview.src = `${ANALYTICS_HTTP_URL}/snapshot.jpg?camera_id=${currentCameraId}&t=${Date.now()}`;
            popup.style.display = "block";
        }
    };
}

if (editSafeAreaBtn) {
    editSafeAreaBtn.onclick = () => {
        showSafeAreaEditor();
    };
}

if (fallAlgorithmSelect) {
    fallAlgorithmSelect.onchange = () => {
        const algorithm = parseInt(fallAlgorithmSelect.value);
        sendCommand("set_fall_algorithm", algorithm);
    };
}

// ============================================
// SAFE AREA EDITOR
// ============================================

async function loadSafeAreasForCamera(cameraId) {
    try {
        const response = await fetch(`${ANALYTICS_HTTP_URL}/get_safe_areas?camera_id=${cameraId}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        if (response.ok) {
            safeAreas = await response.json();
            console.log(`Loaded ${safeAreas.length} safe areas for ${cameraId}`);
        }
    } catch (error) {
        console.error(`Failed to load safe areas for ${cameraId}:`, error);
        safeAreas = [];
    }
}

async function showSafeAreaEditor() {
    if (!isConnected) {
        alert('Camera is disconnected. Cannot edit safe areas.');
        return;
    }
    
    try {
        // Load current safe areas
        await loadSafeAreasForCamera(currentCameraId);
        
        // Load background image
        backgroundImage = new Image();
        backgroundImage.onload = function() {
            initializeCanvas();
            safeAreaPopup.style.display = "block";
            isEditing = true;
            drawSafeAreas();
        };
        backgroundImage.onerror = function() {
            alert('Failed to load background image');
        };
        backgroundImage.src = `${ANALYTICS_HTTP_URL}/snapshot.jpg?camera_id=${currentCameraId}&t=${Date.now()}`;
        
    } catch (error) {
        console.error('Error showing safe area editor:', error);
        alert('Failed to open safe area editor');
    }
}

function initializeCanvas() {
    if (!backgroundImage) return;
    
    originalImageWidth = backgroundImage.width;
    originalImageHeight = backgroundImage.height;
    
    // Set canvas size
    safeAreaCanvas.width = originalImageWidth;
    safeAreaCanvas.height = originalImageHeight;
    
    // Calculate display scale
    const maxWidth = 800;
    const maxHeight = 600;
    const scaleX = maxWidth / originalImageWidth;
    const scaleY = maxHeight / originalImageHeight;
    canvasScale = Math.min(scaleX, scaleY);
    
    safeAreaCanvas.style.width = (originalImageWidth * canvasScale) + 'px';
    safeAreaCanvas.style.height = (originalImageHeight * canvasScale) + 'px';
    
    canvasContext = safeAreaCanvas.getContext('2d');
    
    // Add event listeners
    safeAreaCanvas.addEventListener('click', handleCanvasClick);
    safeAreaCanvas.addEventListener('mousemove', handleCanvasMouseMove);
    safeAreaCanvas.addEventListener('contextmenu', handleCanvasRightClick);
    
    // Toolbar listeners
    if (newPolygonBtn) newPolygonBtn.onclick = startNewPolygon;
    if (clearAllBtn) clearAllBtn.onclick = clearAllPolygons;
    if (saveSafeAreasBtn) saveSafeAreasBtn.onclick = saveSafeAreas;
}

function getCanvasCoordinates(event) {
    const rect = safeAreaCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
    // Convert to original image coordinates
    return {
        x: Math.floor(x / canvasScale),
        y: Math.floor(y / canvasScale)
    };
}

function handleCanvasClick(event) {
    if (!isEditing) return;
    
    const { x, y } = getCanvasCoordinates(event);
    const normalizedX = x / originalImageWidth;
    const normalizedY = y / originalImageHeight;
    
    // Check if closing polygon
    if (currentPolygon.length >= 3) {
        const firstPoint = currentPolygon[0];
        const distance = Math.sqrt(
            Math.pow(normalizedX - firstPoint[0], 2) + 
            Math.pow(normalizedY - firstPoint[1], 2)
        );
        
        if (distance < 0.05) {
            finishCurrentPolygon();
            return;
        }
    }
    
    // Add new point
    currentPolygon.push([normalizedX, normalizedY]);
    drawSafeAreas();
}

function handleCanvasMouseMove(event) {
    if (!isEditing || currentPolygon.length === 0) return;
    
    const { x, y } = getCanvasCoordinates(event);
    const normalizedX = x / originalImageWidth;
    const normalizedY = y / originalImageHeight;
    
    drawSafeAreas([...currentPolygon, [normalizedX, normalizedY]]);
}

function handleCanvasRightClick(event) {
    event.preventDefault();
    if (!isEditing || currentPolygon.length === 0) return;
    
    currentPolygon.pop();
    drawSafeAreas();
}

function startNewPolygon() {
    if (currentPolygon.length >= 3) {
        finishCurrentPolygon();
    }
    currentPolygon = [];
    drawSafeAreas();
}

function finishCurrentPolygon() {
    if (currentPolygon.length >= 3) {
        safeAreas.push([...currentPolygon]);
        currentPolygon = [];
        drawSafeAreas();
    }
}

function clearAllPolygons() {
    if (confirm("Clear all safe areas?")) {
        safeAreas = [];
        currentPolygon = [];
        drawSafeAreas();
    }
}

function drawSafeAreas(tempPolygon = null) {
    if (!canvasContext || !backgroundImage) return;
    
    // Clear canvas
    canvasContext.clearRect(0, 0, originalImageWidth, originalImageHeight);
    
    // Draw background
    canvasContext.drawImage(backgroundImage, 0, 0, originalImageWidth, originalImageHeight);
    
    // Draw existing polygons
    safeAreas.forEach((polygon, index) => {
        drawPolygon(polygon, `hsl(${index * 60}, 70%, 50%)`, true);
    });
    
    // Draw current polygon
    const polygonToDraw = tempPolygon || currentPolygon;
    if (polygonToDraw.length > 0) {
        drawPolygon(polygonToDraw, 'cyan', false);
    }
}

function drawPolygon(polygon, color, isComplete) {
    if (polygon.length === 0) return;
    
    canvasContext.strokeStyle = color;
    canvasContext.fillStyle = color + '40';
    canvasContext.lineWidth = 2;
    canvasContext.setLineDash(isComplete ? [] : [5, 5]);
    
    // Convert normalized to pixel coordinates
    const points = polygon.map(p => [
        p[0] * originalImageWidth,
        p[1] * originalImageHeight
    ]);
    
    // Draw polygon
    canvasContext.beginPath();
    canvasContext.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
        canvasContext.lineTo(points[i][0], points[i][1]);
    }
    
    if (isComplete && points.length >= 3) {
        canvasContext.closePath();
        canvasContext.fill();
    }
    
    canvasContext.stroke();
    canvasContext.setLineDash([]);
    
    // Draw points
    points.forEach((point, index) => {
        canvasContext.fillStyle = color;
        canvasContext.beginPath();
        canvasContext.arc(point[0], point[1], 4, 0, Math.PI * 2);
        canvasContext.fill();
        
        // Highlight first point
        if (index === 0 && !isComplete && polygon.length >= 3) {
            canvasContext.strokeStyle = 'yellow';
            canvasContext.lineWidth = 2;
            canvasContext.beginPath();
            canvasContext.arc(point[0], point[1], 8, 0, Math.PI * 2);
            canvasContext.stroke();
        }
    });
}

async function saveSafeAreas() {
    // Finish current polygon
    if (currentPolygon.length >= 3) {
        safeAreas.push([...currentPolygon]);
        currentPolygon = [];
    }
    
    if (saveStatus) {
        saveStatus.textContent = "Saving...";
        saveStatus.className = "status saving";
    }
    
    try {
        const response = await fetch(`${ANALYTICS_HTTP_URL}/set_safe_areas`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                camera_id: currentCameraId,
                safe_areas: safeAreas
            })
        });
        
        if (response.ok) {
            if (saveStatus) {
                saveStatus.textContent = "Saved successfully!";
                saveStatus.className = "status success";
            }
            
            // Also send command to camera to update safe areas
            sendCommand("update_safe_areas", safeAreas);
            
            setTimeout(() => {
                hideSafeAreaPopup();
            }, 1000);
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('Save error:', error);
        if (saveStatus) {
            saveStatus.textContent = "Save failed";
            saveStatus.className = "status error";
        }
    }
}

function hideSafeAreaPopup() {
    safeAreaPopup.style.display = "none";
    isEditing = false;
    
    // Clean up
    if (canvasContext) {
        safeAreaCanvas.removeEventListener('click', handleCanvasClick);
        safeAreaCanvas.removeEventListener('mousemove', handleCanvasMouseMove);
        safeAreaCanvas.removeEventListener('contextmenu', handleCanvasRightClick);
    }
}

// ============================================
// POPUP FUNCTIONS
// ============================================

function confirmBackground() {
    sendCommand("set_background", true);
    hidePopup();
}

function hidePopup() {
    if (popup) popup.style.display = "none";
}

async function showRegistrationPopup() {
    await loadPendingRegistrations();
    
    if (pendingRegistrations.length === 0) {
        alert('No pending camera registrations.');
        return;
    }
    
    const popup = document.getElementById('registrationPopup');
    const listDiv = document.getElementById('registrationList');
    const formDiv = document.getElementById('registrationForm');
    
    // Build list of pending cameras
    listDiv.innerHTML = '<h4>Pending Camera Registrations:</h4>';
    
    pendingRegistrations.forEach(reg => {
        const regDiv = document.createElement('div');
        regDiv.className = 'registration-item';
        regDiv.onclick = () => selectRegistration(reg.temp_id, reg.ip_address);
        
        const ageMinutes = Math.round(reg.age_seconds / 60);
        regDiv.innerHTML = `
            <strong>IP Address: ${reg.ip_address}</strong>
            <span>MAC: ${reg.mac_address || 'Unknown'}</span>
            <span>Waiting for ${ageMinutes} minute${ageMinutes !== 1 ? 's' : ''}</span>
        `;
        
        listDiv.appendChild(regDiv);
    });
    
    // Reset form
    formDiv.style.display = 'none';
    listDiv.style.display = 'block';
    popup.style.display = 'block';
}

function selectRegistration(tempId, ip) {
    selectedTempId = tempId;
    
    const listDiv = document.getElementById('registrationList');
    const formDiv = document.getElementById('registrationForm');
    const ipSpan = document.getElementById('regCameraIP');
    
    ipSpan.textContent = ip;
    listDiv.style.display = 'none';
    formDiv.style.display = 'block';
}

async function approveRegistration() {
    const cameraName = document.getElementById('cameraNameInput').value.trim();
    
    if (!cameraName) {
        alert('Please enter a camera name.');
        return;
    }
    
    if (!selectedTempId) {
        alert('No camera selected.');
        return;
    }
    
    try {
        const response = await fetch(`${ANALYTICS_HTTP_URL}/approve_registration`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                temp_id: selectedTempId,
                camera_name: cameraName
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            alert(`Camera registered as: ${result.camera_name} (${result.camera_id})`);
            
            // Reload camera list
            await loadCameraList();
            hideRegistrationPopup();
        } else {
            alert('Registration failed.');
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('Registration error.');
    }
}

function hideRegistrationPopup() {
    const popup = document.getElementById('registrationPopup');
    popup.style.display = 'none';
    selectedTempId = null;
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    ANALYTICS_HTTP_URL = window.location.origin;
    console.log(`Connected to analytics server: ${ANALYTICS_HTTP_URL}`);
    
    // Set up dynamic UI elements
    setupDynamicUI();
    
    // Initialize stream
    startStream();
    
    // Set up Camera Registration UI
    setupRegistrationUI();
    setTimeout(loadPendingRegistrations, 2000);
    
    // Load initial data
    loadCameraList();
    fetchCameraState(currentCameraId);
    loadSafeAreasForCamera(currentCameraId);
    
    // Set up periodic updates
    cameraListTimer = setInterval(loadCameraList, 30000); // Update camera list every 30 seconds
    cameraStateTimer = setInterval(() => fetchCameraState(currentCameraId), 10000); // Update state every 10 seconds
    cameraStatusTimer = setInterval(() => checkCameraConnection(currentCameraId), 5000); // Check connection every 5 seconds
    
    // Update time display every second
    setInterval(updateLastUpdateDisplay, 1000);
    
    // Stop stream when page closes
    window.addEventListener('beforeunload', stopStream);
    
    // Handle window resize for editor
    window.addEventListener('resize', function() {
        if (isEditing && backgroundImage) {
            initializeCanvas();
            drawSafeAreas();
        }
    });
});

// ============================================
// GLOBAL EXPORTS
// ============================================

window.confirmBackground = confirmBackground;
window.hidePopup = hidePopup;
window.hideSafeAreaPopup = hideSafeAreaPopup;
window.sendCommand = sendCommand;
window.loadCameraList = loadCameraList;
window.fetchCameraState = fetchCameraState;