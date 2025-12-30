// script.js - Multi-Camera Analytics Dashboard with Camera Management
// Updated to match analytics.py and main.py functionality

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

// Camera selection
const cameraSelect = document.getElementById('cameraSelect');
const refreshCamerasBtn = document.getElementById('refreshCamerasBtn');
const cameraInfoSpan = document.getElementById('camera-info');
const pendingRegBtn = document.getElementById('pendingRegistrationsBtn');
const pendingRegCount = document.getElementById('pendingRegCount');
const manageCamerasBtn = document.getElementById('manageCamerasBtn');

// Popup elements
const popup = document.getElementById('popup');
const preview = document.getElementById('preview');
const safeAreaPopup = document.getElementById('safeAreaPopup');
const registrationPopup = document.getElementById('registrationPopup');
const managementPopup = document.getElementById('managementPopup');

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
let currentCameraId = "camera_000";
let currentCameraName = "Camera 000";
let currentCameraStatus = "unknown";

// Analytics server URL
let ANALYTICS_HTTP_URL = window.location.origin;

// Stream state
let streamRefreshInterval = null;
const REFRESH_INTERVAL_MS = 200;
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

// Status elements
let statusIndicator = document.getElementById('stream-status');

// Camera registration state
let pendingRegistrations = [];
let selectedCameraId = null;
let selectedCameraIp = null;

// ============================================
// STREAM FUNCTIONS
// ============================================

function updateConnectionStatus(cameraId, connected, ageSeconds = null) {
    cameraConnectionStatus[cameraId] = {
        connected: connected,
        lastUpdate: new Date(),
        ageSeconds: ageSeconds
    };
    
    // Update main status indicator
    if (cameraId === currentCameraId) {
        const statusText = connected ? 'Connected' : 'Disconnected';
        
        if (statusIndicator) {
            statusIndicator.textContent = `${currentCameraName}: ${statusText}`;
            statusIndicator.className = '';
            if (connected) {
                statusIndicator.classList.add('connected');
            } else {
                statusIndicator.classList.add('disconnected');
            }
        }
        
        isConnected = connected;
        updateUIControls({});
    }
    
    // Update camera info span with connected count
    updateCameraInfoDisplay();
    
    // Update the camera dropdown to reflect current connection status
    updateCameraDropdownStatus(cameraId, connected);
}

function updateCameraInfoDisplay() {
    if (cameraInfoSpan) {
        const connectedCameras = availableCameras.filter(cam => cameraConnectionStatus[cam.camera_id]?.connected);
        const connectedCount = connectedCameras.length;
        const totalCount = availableCameras.length;
        
        cameraInfoSpan.textContent = `${connectedCount}/${totalCount} camera(s) connected`;
        cameraInfoSpan.style.color = connectedCount > 0 ? '#4CAF50' : '#ff4444';
    }
}

function updateCameraDropdownStatus(cameraId, connected) {
    if (!cameraSelect) return;
    
    // Find the option for this camera
    for (let option of cameraSelect.options) {
        if (option.value === cameraId) {
            // Update the status symbol and color
            const timeAgo = Math.round(cameraConnectionStatus[cameraId]?.ageSeconds || 0);
            const status = connected ? '✓' : '✗';
            const statusText = connected ? 'Connected' : 'Disconnected';
            
            // Extract the camera name (remove any existing status symbol)
            const optionText = option.textContent;
            const baseName = optionText.replace(/ [✓✗⚠️]$/, '');
            option.textContent = `${baseName} ${status}`;
            option.title = `${statusText}, ${timeAgo}s ago`;
            option.style.color = connected ? '#4CAF50' : '#ff4444';
            
            // Also update the current camera name if it's selected
            if (cameraId === currentCameraId) {
                const cameraInfo = availableCameras.find(cam => cam.camera_id === cameraId);
                if (cameraInfo) {
                    currentCameraName = cameraInfo.camera_name || cameraInfo.camera_id;
                }
                
                // Update connected camera display
                const connectedCameraElement = document.getElementById('connectedCamera');
                if (connectedCameraElement) {
                    connectedCameraElement.textContent = currentCameraName;
                }
            }
            
            break;
        }
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
    stopStream();
    
    if (streamImg) {
        console.log(`Starting auto-refresh stream for ${currentCameraId} at ${REFRESH_INTERVAL_MS}ms interval`);
        
        checkCameraConnection(currentCameraId);
        refreshStreamImage();
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
    
    const timestamp = Date.now();
    const streamUrl = `${ANALYTICS_HTTP_URL}/stream.jpg?camera_id=${currentCameraId}&t=${timestamp}`;
    
    lastUpdateTime = new Date();
    
    streamImg.src = streamUrl;
    
    streamImg.onload = function() {
        errorCount = 0;
        checkCameraConnection(currentCameraId);
    };
    
    streamImg.onerror = function() {
        errorCount++;
        console.error(`Stream error ${errorCount}/${MAX_ERRORS} for ${currentCameraId}`);
        updateConnectionStatus(currentCameraId, false);
        
        if (errorCount >= MAX_ERRORS) {
            console.error('Too many stream errors, trying to recover...');
            errorCount = 0;
            loadCameraList();
        }
    };
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
            
            // Update connection status for ALL cameras
            availableCameras.forEach(camera => {
                updateConnectionStatus(camera.camera_id, camera.online, camera.age_seconds);
            });
            
            // FORCE refresh current camera connection status
            if (currentCameraId) {
                const cameraInfo = availableCameras.find(cam => cam.camera_id === currentCameraId);
                if (cameraInfo) {
                    updateConnectionStatus(currentCameraId, cameraInfo.online, cameraInfo.age_seconds);
                    // Also refresh the camera state
                    fetchCameraState(currentCameraId);
                }
            }
            
            // Update registration button status
            updateRegistrationButton();
            
        } else {
            throw new Error(`HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('Failed to load camera list:', error);
        if (cameraInfoSpan) {
            cameraInfoSpan.textContent = 'Connection error';
            cameraInfoSpan.style.color = '#ff4444';
        }
    }
}

function updateCameraSelect(cameras) {
    if (!cameraSelect) return;
    
    const currentValue = cameraSelect.value;
    const previousCameraId = currentCameraId; // Store previous camera ID
    
    console.log(`Updating camera list. Previous camera: ${previousCameraId}, Current selection: ${currentValue}`);
    
    cameraSelect.innerHTML = '<option value="" disabled>Select a camera</option>';
    
    if (!cameras || cameras.length === 0) {
        const option = document.createElement('option');
        option.value = "camera_000";
        option.textContent = "No cameras available";
        cameraSelect.appendChild(option);
        cameraSelect.value = "camera_000";
        
        // If we had a camera before but now none exist
        if (previousCameraId && previousCameraId !== "camera_000") {
            console.log(`No cameras available now, was on ${previousCameraId}. Stopping stream.`);
            currentCameraId = "camera_000";
            currentCameraName = "No Camera";
            stopStream();
        }
        return;
    }
    
    // Separate registered and unregistered cameras
    const registeredCameras = [];
    const unregisteredCameras = [];
    
    cameras.forEach(camera => {
        if (camera.registered) {
            registeredCameras.push(camera);
        } else {
            unregisteredCameras.push(camera);
        }
    });
    
    // Add registered cameras first
    if (registeredCameras.length > 0) {
        const group = document.createElement('optgroup');
        group.label = "📹 Registered Cameras";
        registeredCameras.forEach(camera => {
            const option = document.createElement('option');
            option.value = camera.camera_id;
            
            const timeAgo = Math.round(camera.age_seconds || 0);
            const status = camera.online ? '✓' : '✗';
            const statusText = camera.online ? 'Connected' : 'Disconnected';
            
            option.textContent = `${camera.camera_name} ${status}`;
            option.title = `${statusText}, ${timeAgo}s ago`;
            option.style.color = camera.online ? '#4CAF50' : '#ff4444';
            
            group.appendChild(option);
        });
        cameraSelect.appendChild(group);
    }
    
    // Add unregistered cameras
    if (unregisteredCameras.length > 0) {
        const group = document.createElement('optgroup');
        group.label = "⏳ Pending Registration";
        unregisteredCameras.forEach(camera => {
            const option = document.createElement('option');
            option.value = camera.camera_id;
            
            const timeAgo = Math.round(camera.age_seconds || 0);
            const status = camera.online ? '⚠️' : '✗';
            
            option.textContent = `${camera.camera_name} ${status}`;
            option.title = `Awaiting approval, ${timeAgo}s ago`;
            option.style.color = '#FF9800'; // Orange for pending
            option.disabled = true; // Disable selection of unregistered cameras
            
            group.appendChild(option);
        });
        cameraSelect.appendChild(group);
    }
    
    // Determine new camera ID
    let newCameraId = currentValue;
    let selectedCamera = null;
    
    if (currentValue && cameras.some(cam => cam.camera_id === currentValue)) {
        // Keep the same camera selected
        cameraSelect.value = currentValue;
        newCameraId = currentValue;
        selectedCamera = cameras.find(cam => cam.camera_id === currentValue);
    } else if (registeredCameras.length > 0) {
        // Select first registered camera
        cameraSelect.value = registeredCameras[0].camera_id;
        newCameraId = registeredCameras[0].camera_id;
        selectedCamera = registeredCameras[0];
    } else if (unregisteredCameras.length > 0) {
        // Only show unregistered if no registered cameras
        cameraSelect.value = unregisteredCameras[0].camera_id;
        newCameraId = unregisteredCameras[0].camera_id;
        selectedCamera = unregisteredCameras[0];
    }
    
    // Update camera info
    if (selectedCamera) {
        currentCameraId = newCameraId;
        currentCameraName = selectedCamera.camera_name || selectedCamera.camera_id;
        currentCameraStatus = selectedCamera.registered ? "registered" : "pending";
        updateConnectionStatus(currentCameraId, selectedCamera.online, selectedCamera.age_seconds);
    }
    
    // Update registration status display
    updateRegistrationStatusDisplay();
    
    // Only start stream if camera actually changed
    if (previousCameraId !== newCameraId && newCameraId && newCameraId !== "camera_000") {
        console.log(`Camera changed from ${previousCameraId} to ${newCameraId}. Starting stream.`);
        startStream();
        fetchCameraState(newCameraId);
    } else if (newCameraId && newCameraId !== "camera_000") {
        console.log(`Camera unchanged (${newCameraId}). Not restarting stream.`);
        // Still update camera state even if stream is already running
        fetchCameraState(newCameraId);
    }
}

async function updateCurrentCameraInfo() {
    try {
        const response = await fetch(`${ANALYTICS_HTTP_URL}/camera_registry`);
        if (response.ok) {
            const data = await response.json();
            const cameras = data.cameras || {};
            
            if (cameras[currentCameraId]) {
                currentCameraName = cameras[currentCameraId].name || currentCameraId;
                currentCameraStatus = "registered";
                updateConnectionStatus(currentCameraId, cameraConnectionStatus[currentCameraId]?.connected || false);
            } else {
                // Check if camera is pending
                const pendingResponse = await fetch(`${ANALYTICS_HTTP_URL}/pending_registrations`);
                if (pendingResponse.ok) {
                    const pendingData = await pendingResponse.json();
                    const isPending = pendingData.pending.some(reg => reg.camera_id === currentCameraId);
                    if (isPending) {
                        currentCameraStatus = "pending";
                        currentCameraName = "Pending Camera";
                    } else {
                        currentCameraStatus = "unknown";
                        currentCameraName = currentCameraId;
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error updating camera info:', error);
        currentCameraName = currentCameraId;
        currentCameraStatus = "unknown";
    }
}

async function loadPendingRegistrations() {
    try {
        const response = await fetch(`${ANALYTICS_HTTP_URL}/pending_registrations`);
        if (response.ok) {
            const data = await response.json();
            console.log(`REGISTRATIONS DATA: ${pendingRegistrations}`)
            pendingRegistrations = data.pending || [];
            console.log(`Loaded ${pendingRegistrations.length} pending registrations:`, pendingRegistrations);
            updateRegistrationButton();
            return pendingRegistrations;
        } else {
            console.error(`Failed to load pending registrations: HTTP ${response.status}`);
        }
    } catch (error) {
        console.error('Failed to load pending registrations:', error);
    }
    return [];
}

function updateRegistrationStatusDisplay() {
    const regStatusElement = document.getElementById('registrationStatus');
    if (regStatusElement) {
        if (currentCameraStatus === "registered") {
            regStatusElement.textContent = "Registered";
            regStatusElement.style.color = '#4CAF50';
        } else if (currentCameraStatus === "pending") {
            regStatusElement.textContent = "Pending Approval";
            regStatusElement.style.color = '#FF9800';
        } else {
            regStatusElement.textContent = "Unregistered";
            regStatusElement.style.color = '#FF4444';
        }
    }
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
            
            if (flags.fall_algorithm !== undefined) {
                updateAlgorithmSelection(flags.fall_algorithm, false);
            }
            
            // Update connection status from the response
            if (flags._connected !== undefined) {
                updateConnectionStatus(cameraId, flags._connected);
            }
            
            return flags;
        }
    } catch (error) {
        console.error(`Failed to fetch state for ${cameraId}:`, error);
        // Update status as disconnected on error
        updateConnectionStatus(cameraId, false);
    }
    return null;
}

function updateUIControls(flags) {
    if (!flags) return;
    
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
    
    setBackgroundBtn.disabled = !isConnected;
    editSafeAreaBtn.disabled = !isConnected;
    
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
    const algorithmStr = algorithmValue.toString();
    
    if (fallAlgorithmSelect) {
        fallAlgorithmSelect.value = algorithmStr;
    }
    
    const algorithmCards = document.querySelectorAll('.card');
    algorithmCards.forEach(card => {
        if (card.dataset.algorithm === algorithmStr) {
            card.dataset.active = 'true';
        } else {
            delete card.dataset.active;
        }
    });
    
    if (updateCamera && isConnected && window.sendCommand) {
        console.log(`Setting fall algorithm to: ${algorithmStr}`);
        window.sendCommand("set_fall_algorithm", parseInt(algorithmStr));
    }
}

// ============================================
// CAMERA MANAGEMENT FUNCTIONS
// ============================================

async function showManagementPopup() {
    try {
        const response = await fetch(`${ANALYTICS_HTTP_URL}/registered_cameras`);
        if (response.ok) {
            const data = await response.json();
            const cameras = data.cameras || {};
            
            const listDiv = document.getElementById('managementList');
            listDiv.innerHTML = '<h3 style="margin-top: 0; color: var(--theme-primary);">Registered Cameras:</h3>';
            
            if (Object.keys(cameras).length === 0) {
                listDiv.innerHTML += '<p style="text-align: center; color: #aaa; padding: 20px;">No registered cameras.</p>';
            } else {
                Object.entries(cameras).forEach(([cameraId, cameraData]) => {
                    const camDiv = document.createElement('div');
                    camDiv.className = 'camera-item';
                    camDiv.style.cssText = 'background: var(--theme-surface-light); border: 1px solid var(--theme-border); border-radius: 8px; padding: 15px; margin: 10px 0;';
                    
                    const firstSeen = new Date(cameraData.first_seen * 1000).toLocaleString();
                    const lastSeen = new Date(cameraData.last_seen * 1000).toLocaleString();
                    
                    camDiv.innerHTML = `
                        <div class="camera-info">
                            <div class="camera-name">${cameraData.name} (${cameraId})</div>
                            <div class="camera-details">
                                <span>📡 IP: ${cameraData.ip_address || 'Unknown'}</span>
                                <span>⏰ First seen: ${firstSeen}</span>
                                <span>🕐 Last seen: ${lastSeen}</span>
                            </div>
                        </div>
                        <button onclick="forgetCamera('${cameraId}')" class="forget-btn" style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 8px 15px; font-size: 0.9em;">Forget</button>
                    `;
                    
                    listDiv.appendChild(camDiv);
                });
            }
            
            managementPopup.style.display = 'block';
        }
    } catch (error) {
        console.error('Failed to load registered cameras:', error);
        alert('Failed to load camera list');
    }
}

async function forgetCamera(cameraId) {
    if (!confirm(`Are you sure you want to forget camera ${cameraId}? This cannot be undone.`)) {
        return;
    }
    
    try {
        const response = await fetch(`${ANALYTICS_HTTP_URL}/forget_camera`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                camera_id: cameraId
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            alert(`✅ Camera ${cameraId} has been forgotten.`);
            
            // Reload camera list
            await loadCameraList();
            
            // If we forgot the current camera, switch to another one
            if (cameraId === currentCameraId) {
                const cameras = await getAvailableCameras();
                if (cameras.length > 0) {
                    currentCameraId = cameras[0].camera_id;
                    cameraSelect.value = currentCameraId;
                    
                    // Update camera name
                    const selectedCamera = cameras.find(cam => cam.camera_id === currentCameraId);
                    currentCameraName = selectedCamera?.camera_name || currentCameraId;
                    
                    startStream();
                    fetchCameraState(currentCameraId);
                } else {
                    // No cameras left
                    currentCameraId = "camera_000";
                    currentCameraName = "No Camera";
                    cameraSelect.value = "camera_000";
                }
            }
            
            // Refresh management popup
            showManagementPopup();
        } else {
            alert('❌ Failed to forget camera.');
        }
    } catch (error) {
        console.error('Forget camera error:', error);
        alert('❌ Error forgetting camera.');
    }
}

function hideManagementPopup() {
    managementPopup.style.display = 'none';
}

async function getAvailableCameras() {
    try {
        const response = await fetch(`${ANALYTICS_HTTP_URL}/camera_list`);
        if (response.ok) {
            const data = await response.json();
            return data.cameras || [];
        }
    } catch (error) {
        console.error('Failed to get available cameras:', error);
    }
    return [];
}

function updateRegistrationButton() {
    if (pendingRegistrations.length > 0) {
        pendingRegBtn.style.display = 'inline-block';
        pendingRegCount.textContent = pendingRegistrations.length;
        pendingRegBtn.classList.add('pulse');
    } else {
        pendingRegBtn.style.display = 'none';
        pendingRegBtn.classList.remove('pulse');
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
        await loadSafeAreasForCamera(currentCameraId);
        
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
    
    safeAreaCanvas.width = originalImageWidth;
    safeAreaCanvas.height = originalImageHeight;
    
    const maxWidth = 800;
    const maxHeight = 600;
    const scaleX = maxWidth / originalImageWidth;
    const scaleY = maxHeight / originalImageHeight;
    canvasScale = Math.min(scaleX, scaleY);
    
    safeAreaCanvas.style.width = (originalImageWidth * canvasScale) + 'px';
    safeAreaCanvas.style.height = (originalImageHeight * canvasScale) + 'px';
    
    canvasContext = safeAreaCanvas.getContext('2d');
    
    safeAreaCanvas.addEventListener('click', handleCanvasClick);
    safeAreaCanvas.addEventListener('mousemove', handleCanvasMouseMove);
    safeAreaCanvas.addEventListener('contextmenu', handleCanvasRightClick);
    
    if (newPolygonBtn) newPolygonBtn.onclick = startNewPolygon;
    if (clearAllBtn) clearAllBtn.onclick = clearAllPolygons;
    if (saveSafeAreasBtn) saveSafeAreasBtn.onclick = saveSafeAreas;
}

function getCanvasCoordinates(event) {
    const rect = safeAreaCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    
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
    
    canvasContext.clearRect(0, 0, originalImageWidth, originalImageHeight);
    canvasContext.drawImage(backgroundImage, 0, 0, originalImageWidth, originalImageHeight);
    
    safeAreas.forEach((polygon, index) => {
        drawPolygon(polygon, `hsl(${index * 60}, 70%, 50%)`, true);
    });
    
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
    
    const points = polygon.map(p => [
        p[0] * originalImageWidth,
        p[1] * originalImageHeight
    ]);
    
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
    
    points.forEach((point, index) => {
        canvasContext.fillStyle = color;
        canvasContext.beginPath();
        canvasContext.arc(point[0], point[1], 4, 0, Math.PI * 2);
        canvasContext.fill();
        
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
    
    if (canvasContext) {
        safeAreaCanvas.removeEventListener('click', handleCanvasClick);
        safeAreaCanvas.removeEventListener('mousemove', handleCanvasMouseMove);
        safeAreaCanvas.removeEventListener('contextmenu', handleCanvasRightClick);
    }
}

// ============================================
// REGISTRATION POPUP FUNCTIONS
// ============================================

async function showRegistrationPopup() {
    await loadPendingRegistrations();
    
    const popup = document.getElementById('registrationPopup');
    const listDiv = document.getElementById('registrationList');
    const formDiv = document.getElementById('registrationForm');
    
    listDiv.innerHTML = '<h3 style="margin-top: 0; color: var(--theme-primary);">⏳ Pending Camera Registrations:</h3>';
    
    if (pendingRegistrations.length === 0) {
        listDiv.innerHTML += '<p style="text-align: center; color: #aaa; padding: 20px;">No pending registrations.</p>';
    } else {
        pendingRegistrations.forEach(reg => {
            const regDiv = document.createElement('div');
            regDiv.className = 'registration-item';
            regDiv.style.cssText = 'background: var(--theme-surface-light); border: 1px solid var(--theme-border); border-radius: 8px; padding: 15px; margin: 10px 0; cursor: pointer; transition: all 0.2s;';
            regDiv.onmouseenter = () => regDiv.style.backgroundColor = 'rgba(var(--theme-primary-rgb, 74, 158, 255), 0.1)';
            regDiv.onmouseleave = () => regDiv.style.backgroundColor = 'var(--theme-surface-light)';
            regDiv.onclick = () => selectRegistration(reg.camera_id, reg.ip_address);
            
            const ageMinutes = Math.round(reg.age_seconds / 60);
            const last6Digits = reg.camera_id ? reg.camera_id.slice(-6) : 'Unknown';
            
            regDiv.innerHTML = `
                <div style="font-weight: bold; color: white; margin-bottom: 5px;">📷 Camera ID: ${reg.camera_id || 'Generating...'}</div>
                <div style="font-size: 14px; color: #ccc; margin-bottom: 3px;">📍 IP: ${reg.ip_address}</div>
                <div style="font-size: 13px; color: #aaa;">⏰ Waiting: ${ageMinutes} minute${ageMinutes !== 1 ? 's' : ''}</div>
            `;
            
            listDiv.appendChild(regDiv);
        });
    }
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.onclick = hideRegistrationPopup;
    closeBtn.style.cssText = 'width: 100%; margin-top: 15px;';
    listDiv.appendChild(closeBtn);
    
    formDiv.style.display = 'none';
    listDiv.style.display = 'block';
    popup.style.display = 'block';
}

function selectRegistration(cameraId, ip) {
    selectedCameraId = cameraId;
    selectedCameraIp = ip;
    
    const listDiv = document.getElementById('registrationList');
    const formDiv = document.getElementById('registrationForm');
    const ipSpan = document.getElementById('regCameraIP');
    const cameraIdSpan = document.getElementById('regCameraID');
    const nameInput = document.getElementById('cameraNameInput');
    
    ipSpan.textContent = ip;
    cameraIdSpan.textContent = cameraId;
    
    // Generate a default name based on camera ID
    const defaultName = `Camera ${cameraId ? cameraId.split('_').pop() : 'New'}`;
    nameInput.value = defaultName;
    
    listDiv.style.display = 'none';
    formDiv.style.display = 'block';
}

async function approveRegistration() {
    const cameraName = document.getElementById('cameraNameInput').value.trim();
    
    if (!cameraName) {
        alert('Please enter a camera name.');
        return;
    }
    
    if (!selectedCameraId || !selectedCameraIp) {
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
                ip_address: selectedCameraIp,
                camera_name: cameraName
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Remove from pending registrations
            pendingRegistrations = pendingRegistrations.filter(reg => reg.camera_id !== selectedCameraId);
            updateRegistrationButton();
            
            // IMMEDIATELY refresh camera list after approval
            console.log(`Camera approved: ${cameraName}. Refreshing camera list...`);
            
            // Force refresh of all data
            await loadPendingRegistrations();
            await loadCameraList();
            
            // Switch to the newly approved camera
            if (availableCameras.some(cam => cam.camera_id === selectedCameraId && cam.registered)) {
                cameraSelect.value = selectedCameraId;
                currentCameraId = selectedCameraId;
                currentCameraName = cameraName;
                
                console.log(`Switching to newly approved camera: ${cameraName}`);
                
                // Update UI
                const connectedCameraElement = document.getElementById('connectedCamera');
                if (connectedCameraElement) {
                    connectedCameraElement.textContent = currentCameraName;
                }
                
                // Update registration status
                currentCameraStatus = "registered";
                updateRegistrationStatusDisplay();
                
                // Force status refresh and stream restart
                await checkCameraConnection(currentCameraId);
                await fetchCameraState(currentCameraId);
                startStream();
            }
            
            hideRegistrationPopup();
            
            alert(`✅ Camera registered as: ${result.camera_name} (${result.camera_id})`);
        } else {
            const errorData = await response.json().catch(() => ({}));
            alert(`❌ Registration failed: ${errorData.error || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('❌ Registration error.');
    }
}

function hideRegistrationPopup() {
    const popup = document.getElementById('registrationPopup');
    popup.style.display = 'none';
    selectedCameraId = null;
    selectedCameraIp = null;
}

function backToRegistrationList() {
    const listDiv = document.getElementById('registrationList');
    const formDiv = document.getElementById('registrationForm');
    
    formDiv.style.display = 'none';
    listDiv.style.display = 'block';
    
    document.getElementById('cameraNameInput').value = '';
    selectedCameraId = null;
    selectedCameraIp = null;
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

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    ANALYTICS_HTTP_URL = window.location.origin;
    console.log(`Connected to analytics server: ${ANALYTICS_HTTP_URL}`);
    
    cameraSelect.onchange = () => {
        currentCameraId = cameraSelect.value;
        const selectedOption = cameraSelect.options[cameraSelect.selectedIndex];
        
        // Check if this camera is disabled (unregistered)
        if (selectedOption.disabled) {
            alert('This camera is awaiting registration approval. Please approve it first.');
            // Revert to previous selection
            const previousCamera = availableCameras.find(cam => cam.camera_id === currentCameraId && cam.registered);
            if (previousCamera) {
                cameraSelect.value = previousCamera.camera_id;
            }
            return;
        }
        
        console.log(`Switched to camera: ${currentCameraId}`);
        
        const cameraInfo = availableCameras.find(cam => cam.camera_id === currentCameraId);
        updateConnectionStatus(currentCameraId, cameraInfo?.online || false);
        
        // Update camera name and status
        if (cameraInfo) {
            currentCameraName = cameraInfo.camera_name || cameraInfo.camera_id;
            currentCameraStatus = cameraInfo.registered ? "registered" : "pending";
        } else {
            // Try to get camera info from registry
            updateCurrentCameraInfo();
        }
        
        const connectedCameraElement = document.getElementById('connectedCamera');
        if (connectedCameraElement) {
            connectedCameraElement.textContent = currentCameraName;
        }
        
        // Update registration status display
        updateRegistrationStatusDisplay();
        
        startStream();
        fetchCameraState(currentCameraId);
        loadSafeAreasForCamera(currentCameraId);
    };
    
    // Set up refresh button
    refreshCamerasBtn.onclick = async () => {
        console.log("Manually refreshing camera list and status...");
        
        // Force immediate refresh of all data
        await loadPendingRegistrations();
        await loadCameraList();
        
        // Force status check for current camera
        if (currentCameraId) {
            await checkCameraConnection(currentCameraId);
            await fetchCameraState(currentCameraId);
        }
        
        // Restart stream with fresh data
        startStream();
        
        console.log("Manual refresh completed");
    };

    // Set up pending registration button
    pendingRegBtn.onclick = showRegistrationPopup;
    
    // Set up manage cameras button
    manageCamerasBtn.onclick = showManagementPopup;
    
    // Initialize stream
    startStream();
    
    // Load initial data - load pending registrations FIRST
    loadPendingRegistrations().then(() => {
        console.log('Pending registrations loaded:', pendingRegistrations.length);
        updateRegistrationButton();
        
        // Then load camera list and other data
        loadCameraList();
        fetchCameraState(currentCameraId);
        loadSafeAreasForCamera(currentCameraId);
        updateCurrentCameraInfo();
    });
    
    // Set up periodic updates
    setInterval(loadPendingRegistrations, 10000);

    setTimeout(() => {
        cameraListTimer = setInterval(loadCameraList, 30000);
        cameraStateTimer = setInterval(() => fetchCameraState(currentCameraId), 10000);
        cameraStatusTimer = setInterval(() => {
            // Check connection for ALL cameras, not just current one
            availableCameras.forEach(camera => {
                checkCameraConnection(camera.camera_id);
            });
            // Also check current camera
            if (currentCameraId) {
                checkCameraConnection(currentCameraId);
            }
        }, 5000);
    }, 2000);
    
    window.addEventListener('beforeunload', stopStream);
    
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
window.showRegistrationPopup = showRegistrationPopup;
window.approveRegistration = approveRegistration;
window.backToRegistrationList = backToRegistrationList;
window.hideRegistrationPopup = hideRegistrationPopup;
window.showManagementPopup = showManagementPopup;
window.hideManagementPopup = hideManagementPopup;
window.forgetCamera = forgetCamera;