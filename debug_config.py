DEBUG_ENABLED = True

def debug_print(tag, message, *args):
    """Print debug messages if debugging is enabled"""
    if DEBUG_ENABLED:
        formatted_message = message % args if args else message
        print(f"[DEBUG {tag}] {formatted_message}")

def log_pose_data(pose_data, source="unknown"):
    """Log pose data for debugging"""
    if DEBUG_ENABLED and pose_data:
        print(f"[DEBUG POSE {source}] Label: {pose_data.get('label', 'N/A')}")
        print(f"[DEBUG POSE {source}] Torso angle: {pose_data.get('torso_angle', 'N/A')}")
        print(f"[DEBUG POSE {source}] Thigh uprightness: {pose_data.get('thigh_uprightness', 'N/A')}")
        
        # Check for fall detection data
        for method in ['method1', 'method2', 'method3', 'fall_detected_old', 'fall_detected_new']:
            if method in pose_data:
                print(f"[DEBUG POSE {source}] {method}: {pose_data[method]}")

def log_fall_detection(fall_detection, algorithm=3):
    """Log fall detection data for debugging"""
    if DEBUG_ENABLED:
        method_key = f"method{algorithm}"
        if fall_detection and method_key in fall_detection:
            data = fall_detection[method_key]
            print(f"[DEBUG FALL Algorithm {algorithm}] Detected: {data.get('detected')}, Counter: {data.get('counter')}")