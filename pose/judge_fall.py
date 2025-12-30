# judge_fall.py

FALL_COUNT_THRES = 2  # how many consecutive falls required to confirm

# persistent counters for consecutive falls for different algorithms
counter_bbox_only = 0        # Algorithm 1: BBox motion only
counter_motion_pose_and = 0  # Algorithm 2: BBox motion AND strict pose
# Algorithm 3 uses the other two counters

def get_fall_info(online_targets_det, online_targets, index, fallParam, queue_size, fps, pose_data=None, hme_mode=False):
    global counter_bbox_only, counter_motion_pose_and

    fall_detected_bbox_only = False      # Algorithm 1
    fall_detected_motion_pose_and = False # Algorithm 2
    fall_detected_flexible = False       # Algorithm 3

    # Handle HME mode differently
    if hme_mode:
        # In HME mode, we might have limited pose information
        # We'll use the label if available, but angles might not be precise
        if pose_data and isinstance(pose_data, dict):
            label = pose_data.get('label')
            # For fall detection in HME mode, we need approximate angle values
            # We can use the raw integer values if available
            raw_vals = pose_data.get('raw_int_values', {})
            
            if label == "lying_down":
                # In HME mode, lying_down from pose classification is a strong indicator
                # We'll use bbox motion as primary and pose label as secondary
                torso_angle_approx = raw_vals.get('Tra', 0) / 100.0 if raw_vals else 85.0
                thigh_uprightness_approx = raw_vals.get('Tha', 0) / 100.0 if raw_vals else 70.0
            else:
                # Not lying, use safe default values
                torso_angle_approx = 30.0
                thigh_uprightness_approx = 30.0
        else:
            # No pose data in HME mode
            torso_angle_approx = 0.0
            thigh_uprightness_approx = 0.0
            label = None
    else:
        # Plain mode: original logic
        if pose_data is None or (isinstance(pose_data, dict) and pose_data.get('label') == "None"):
            # Reset all counters when pose data is invalid
            counter_bbox_only = max(0, counter_bbox_only - 1)
            counter_motion_pose_and = max(0, counter_motion_pose_and - 1)
            return fall_detected_bbox_only, counter_bbox_only, fall_detected_motion_pose_and, counter_motion_pose_and, fall_detected_flexible, 0

    # Case: no detection available
    if online_targets["bbox"][index].empty():
        if counter_bbox_only > 0:
            counter_bbox_only = max(0, counter_bbox_only - 1)
            counter_motion_pose_and = max(0, counter_motion_pose_and - 1)
            return True, counter_bbox_only, False, counter_motion_pose_and, False, 0  # still report bbox_only during detection gaps
        return False, counter_bbox_only, False, counter_motion_pose_and, False, 0

    # Get current and previous bounding boxes
    cur_bbox = [online_targets_det.x, online_targets_det.y, online_targets_det.w, online_targets_det.h]
    pre_bbox = online_targets["bbox"][index].get()
    _ = online_targets["points"][index].get()  # keep points queue in sync with bbox

    elapsed_ms = queue_size * 1000 / fps if fps > 0 else queue_size * 1000

    # 1. Vertical speed of top (y) coordinate — downward movement = positive
    dy_top = cur_bbox[1] - pre_bbox[1]
    v_top = dy_top / elapsed_ms

    # 2. Vertical change of height (shrinking = falling)
    dh = pre_bbox[3] - cur_bbox[3]
    v_height = dh / elapsed_ms

    print(f"[DEBUG] v_top = {v_top:.6f}, v_height = {v_height:.6f}, threshold = {fallParam['v_bbox_y']}")

    if hme_mode:
        # HME mode: use approximate values
        torso_angle = torso_angle_approx
        thigh_uprightness = thigh_uprightness_approx
        print(f"[DEBUG HME] Approx torso_angle={torso_angle}, thigh_uprightness={thigh_uprightness}, label={label}")
    else:
        # Plain mode: extract from pose_data
        torso_angle = None
        thigh_uprightness = None
        
        if pose_data and isinstance(pose_data, dict):
            torso_angle = pose_data.get('torso_angle')
            thigh_uprightness = pose_data.get('thigh_uprightness')
            print(f"[DEBUG POSE] torso_angle={torso_angle}, thigh_uprightness={thigh_uprightness}")

    # Calculate bbox motion evidence
    bbox_motion_detected = (v_top > fallParam["v_bbox_y"] or v_height > fallParam["v_bbox_y"])
    
    # Calculate pose conditions
    strict_pose_condition = False
    flexible_pose_condition = False
    
    if hme_mode:
        # In HME mode, we rely more on the pose classification label
        # and approximate angle values
        if label == "lying_down":
            # If HME classified as lying_down, consider it for fall detection
            flexible_pose_condition = True
            # For strict condition, also check approximate angles
            if torso_angle > 80 and thigh_uprightness > 60:
                strict_pose_condition = True
    else:
        # Plain mode: original angle-based logic
        if torso_angle is not None and thigh_uprightness is not None:
            # Strict condition: clearly lying down
            strict_pose_condition = (torso_angle > 80 and thigh_uprightness > 60)
            
            # Flexible condition: various falling/lying positions
            if torso_angle > 80:
                flexible_pose_condition = True
            elif 30 < torso_angle < 80 and thigh_uprightness > 60:
                flexible_pose_condition = True
    
    # Algorithm 1: BBox Only
    if bbox_motion_detected:
        counter_bbox_only = min(FALL_COUNT_THRES, counter_bbox_only + 1)
    else:
        counter_bbox_only = max(0, counter_bbox_only - 1)

    # Algorithm 2: BBox Motion AND Strict Pose
    if bbox_motion_detected and strict_pose_condition:
        # Strong evidence: both motion AND clearly lying down
        counter_motion_pose_and = min(FALL_COUNT_THRES, counter_motion_pose_and + 2)
    elif bbox_motion_detected or strict_pose_condition:
        # Moderate evidence: one or the other
        counter_motion_pose_and = min(FALL_COUNT_THRES, counter_motion_pose_and + 1)
    else:
        # No evidence
        counter_motion_pose_and = max(0, counter_motion_pose_and - 1)

    # Algorithm 3: Flexible Verification (uses counters from other algorithms)
    # Check if either counter meets threshold AND flexible pose condition is met
    algorithm3_counter = max(counter_bbox_only, counter_motion_pose_and)
    
    if flexible_pose_condition:
        if algorithm3_counter >= FALL_COUNT_THRES:
            fall_detected_flexible = True
            print(f"[FLEXIBLE VERIFICATION] Fall detected using flexible verification")

    # Determine fall status for each algorithm
    if counter_bbox_only >= FALL_COUNT_THRES:
        print(f"[ALGORITHM 1] Fall detected (BBox only, counter={counter_bbox_only})")
        fall_detected_bbox_only = True
    
    if counter_motion_pose_and >= FALL_COUNT_THRES:
        print(f"[ALGORITHM 2] Fall detected (Motion+Pose AND, counter={counter_motion_pose_and})")
        fall_detected_motion_pose_and = True

    return (
        fall_detected_bbox_only, counter_bbox_only,
        fall_detected_motion_pose_and, counter_motion_pose_and,
        fall_detected_flexible, algorithm3_counter
    )
