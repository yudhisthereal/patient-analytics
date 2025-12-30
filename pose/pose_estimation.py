import numpy as np
from collections import deque
import random
import math

# === HME PARAMETERS (used when HME mode is enabled) ===
# Secret keys at caregiver (should match pose_estimation_enc_gsplit.py)
p1 = 234406548094233827948571379965547188853
q1 = 583457592311129510314141861330330044443
r = 696522972436164062959242838052087531431
s = 374670603170509799404699393785831797599
t = 443137959904584298054176676987615849169
w = 391475886865055383118586393345880578361
u = 2355788435550222327802749264573303139783

n1 = p1 * q1 * r * s * t * w
n11 = p1 * q1

# Modular inverses
pinvq = 499967064455987294076532081570894386372
qinvp = 33542671637141449679641257954160235148
gu = u.bit_length() // 2
u1 = u // 2

# Partial products
np1prod = q1 * r * s * t * w
nq1prod = p1 * r * s * t * w
nrprod = p1 * q1 * s * t * w
nsprod = p1 * q1 * r * t * w
ntprod = p1 * q1 * r * s * w
nwprod = p1 * q1 * r * t * s

# Inverses
invnp1 = 205139046479782337030801215788009754117
invnq1 = 429235397156384978572995593851807405098
invnr = 592155359269217457562309991915739180471
invns = 115186784058467557094932562011798848762
invnt = 51850665316568177665825586294193267244
invnw = 44855536902472009823152313099539628632

class PoseEstimation:
    """Pose classifier with optional Homomorphic Encryption support"""
    
    def __init__(self, keypoints_window_size=5, missing_value=-1, use_hme=False):
        self.keypoints_map_deque = deque(maxlen=keypoints_window_size)
        self.status = []
        self.pose_data = {}  # Store detailed pose data
        self.missing_value = missing_value
        
        # Thresholds for limb length ratios (plain mode only)
        self.thigh_calf_ratio_threshold = 0.7
        self.torso_leg_ratio_threshold = 0.5
        
        # HME mode flag
        self.use_hme = use_hme
        
        if self.use_hme:
            print("[HME] Homomorphic Encryption mode ENABLED")
        else:
            print("[HME] Plain mode ENABLED")

    # === PLAIN MODE METHODS ===
    
    def feed_keypoints_17(self, keypoints_17):
        """Process 17 keypoints in either plain or HME mode"""
        try:
            keypoints = np.array(keypoints_17).reshape((-1, 2))
            if keypoints.shape != (17, 2):
                return None
        except:
            return None

        kp_map = {
            'Left Shoulder': keypoints[5],
            'Right Shoulder': keypoints[6],
            'Left Hip': keypoints[11],
            'Right Hip': keypoints[12],
            'Left Knee': keypoints[13],
            'Right Knee': keypoints[14],
            'Left Ankle': keypoints[15],
            'Right Ankle': keypoints[16]
        }

        if self.use_hme:
            return self.feed_keypoints_map_hme(kp_map)
        else:
            return self.feed_keypoints_map_plain(kp_map)

    def _is_frame_complete(self, keypoints_map):
        """Check if all keypoints are present"""
        for k, v in keypoints_map.items():
            if v is None:
                return False
            if v[0] == self.missing_value or v[1] == self.missing_value:
                return False
        return True

    def _calculate_limb_lengths(self, km):
        """Calculate limb lengths for plain mode"""
        try:
            # Calculate thigh length (hip to knee)
            left_thigh = np.linalg.norm(km['Left Hip'] - km['Left Knee'])
            right_thigh = np.linalg.norm(km['Right Hip'] - km['Right Knee'])
            thigh_length = (left_thigh + right_thigh) / 2.0
            
            # Calculate calf length (knee to ankle)
            left_calf = np.linalg.norm(km['Left Knee'] - km['Left Ankle'])
            right_calf = np.linalg.norm(km['Right Knee'] - km['Right Ankle'])
            calf_length = (left_calf + right_calf) / 2.0
            
            # Calculate torso height (shoulder to hip)
            left_torso = np.linalg.norm(km['Left Shoulder'] - km['Left Hip'])
            right_torso = np.linalg.norm(km['Right Shoulder'] - km['Right Hip'])
            torso_height = (left_torso + right_torso) / 2.0
            
            # Calculate leg length (hip to ankle)
            left_leg = np.linalg.norm(km['Left Hip'] - km['Left Ankle'])
            right_leg = np.linalg.norm(km['Right Hip'] - km['Right Ankle'])
            leg_length = (left_leg + right_leg) / 2.0
            
            # Calculate ratios
            thigh_calf_ratio = thigh_length / calf_length if calf_length > 0 else 1.0
            torso_leg_ratio = torso_height / leg_length if leg_length > 0 else 1.0
            
            return thigh_calf_ratio, torso_leg_ratio, thigh_length, calf_length, torso_height, leg_length
        except:
            return 1.0, 1.0, 0.0, 0.0, 0.0, 0.0

    def feed_keypoints_map_plain(self, keypoints_map):
        """Plain mode pose classification"""
        if not self._is_frame_complete(keypoints_map):
            self.status = []
            self.pose_data = {}
            return None

        self.keypoints_map_deque.append(keypoints_map)

        try:
            # Compute averaged keypoints
            km = {
                key: sum(d[key] for d in self.keypoints_map_deque) / len(self.keypoints_map_deque)
                for key in self.keypoints_map_deque[0].keys()
            }

            # Compute centers
            shoulder_center = (km['Left Shoulder'] + km['Right Shoulder']) / 2.0
            hip_center = (km['Left Hip'] + km['Right Hip']) / 2.0
            knee_center = (km['Left Knee'] + km['Right Knee']) / 2.0

            torso_vec = shoulder_center - hip_center
            thigh_vec = knee_center - hip_center
            up_vector = np.array([0.0, -1.0])

            # Safe angle computation
            torso_norm = np.linalg.norm(torso_vec)
            thigh_norm = np.linalg.norm(thigh_vec)
            if torso_norm == 0 or thigh_norm == 0:
                self.status = []
                self.pose_data = {}
                return None

            torso_angle = np.degrees(np.arccos(np.clip(
                np.dot(torso_vec, up_vector) / (torso_norm * np.linalg.norm(up_vector)), -1.0, 1.0)))

            thigh_angle = np.degrees(np.arccos(np.clip(
                np.dot(thigh_vec, up_vector) / (thigh_norm * np.linalg.norm(up_vector)), -1.0, 1.0)))

            thigh_uprightness = abs(thigh_angle - 180.0)

            # Calculate limb length ratios
            thigh_calf_ratio, torso_leg_ratio, thigh_length, calf_length, torso_height, leg_length = self._calculate_limb_lengths(km)

            # Classification
            if torso_angle < 30 and thigh_uprightness < 40:
                if thigh_calf_ratio < self.thigh_calf_ratio_threshold:
                    label = "sitting"
                elif torso_leg_ratio < self.torso_leg_ratio_threshold:
                    label = "bending_down"
                else:
                    label = "standing"
            elif torso_angle < 30 and thigh_uprightness >= 40:
                label = "sitting"
            elif 30 <= torso_angle < 80 and thigh_uprightness < 60:
                label = "bending_down"
            else:
                label = "lying_down"

            # Store detailed pose data
            self.pose_data = {
                'label': label,
                'torso_angle': torso_angle,
                'thigh_uprightness': thigh_uprightness,
                'thigh_calf_ratio': thigh_calf_ratio,
                'torso_leg_ratio': torso_leg_ratio,
                'thigh_angle': thigh_angle,
                'thigh_length': thigh_length,
                'calf_length': calf_length,
                'torso_height': torso_height,
                'leg_length': leg_length
            }
            
            self.status = [label]
            return self.pose_data
            
        except Exception as e:
            print(f"Pose estimation error: {e}")
            self.status = []
            self.pose_data = {}
            return None

    # === HME MODE METHODS ===
    
    def _truncate(self, num):
        """Convert real number to integer with 2 decimal precision"""
        factor = 100
        return math.trunc(num * factor)

    def _encrypt_value(self, m):
        """Encrypt a single value (used by camera)"""
        if not self.use_hme:
            return None
            
        g = random.randint(1, 2**32 - 1)
        c1 = ((g * u) + m) % p1
        c2 = ((g * u) + m) % q1
        c3 = ((g * u) + m) % r
        c4 = ((g * u) + m) % s
        c5 = ((g * u) + m) % t
        c6 = ((g * u) + m) % w
        return [c1, c2, c3, c4, c5, c6]

    def _encrypt_simple(self, m):
        """Simpler encryption for feature values (2 components)"""
        if not self.use_hme:
            return None
            
        g = random.randint(1, 2**32 - 1)
        cth1 = ((g * u) + m) % p1
        cth2 = ((g * u) + m) % q1
        return [cth1, cth2]

    def _decrypt_value(self, c_values):
        """Decrypt a value (used by caregiver)"""
        if not self.use_hme or len(c_values) != 6:
            return None
            
        c1, c2, c3, c4, c5, c6 = c_values
        mout = (((c1 % p1) * invnp1 * np1prod + 
                 (c2 % q1) * invnq1 * nq1prod + 
                 (c3 % r) * invnr * nrprod + 
                 (c4 % s) * invns * nsprod + 
                 (c5 % t) * invnt * ntprod + 
                 (c6 % w) * invnw * nwprod) % n1)
        
        if mout > n1 // 2:
            mout = mout - n1
        mout = mout % u
        return mout

    def feed_keypoints_map_hme(self, keypoints_map):
        """HME mode: Calculate features and prepare encrypted data"""
        if not self._is_frame_complete(keypoints_map):
            self.status = []
            self.pose_data = {}
            return None

        self.keypoints_map_deque.append(keypoints_map)

        try:
            # Compute averaged keypoints
            km = {
                key: sum(d[key] for d in self.keypoints_map_deque) / len(self.keypoints_map_deque)
                for key in self.keypoints_map_deque[0].keys()
            }

            # Compute centers and angles (same as plain mode)
            shoulder_center = (km['Left Shoulder'] + km['Right Shoulder']) / 2.0
            hip_center = (km['Left Hip'] + km['Right Hip']) / 2.0
            knee_center = (km['Left Knee'] + km['Right Knee']) / 2.0

            torso_vec = shoulder_center - hip_center
            thigh_vec = knee_center - hip_center
            up_vector = np.array([0.0, -1.0])

            torso_norm = np.linalg.norm(torso_vec)
            thigh_norm = np.linalg.norm(thigh_vec)
            if torso_norm == 0 or thigh_norm == 0:
                self.status = []
                self.pose_data = {}
                return None

            torso_angle = np.degrees(np.arccos(np.clip(
                np.dot(torso_vec, up_vector) / (torso_norm * np.linalg.norm(up_vector)), -1.0, 1.0)))

            thigh_angle = np.degrees(np.arccos(np.clip(
                np.dot(thigh_vec, up_vector) / (thigh_norm * np.linalg.norm(up_vector)), -1.0, 1.0)))

            thigh_uprightness = abs(thigh_angle - 180.0)

            # Calculate limb lengths
            thigh_calf_ratio, torso_leg_ratio, thigh_length, calf_length, torso_height, leg_length = self._calculate_limb_lengths(km)

            # Convert to integers for encryption
            Thl = self._truncate(thigh_length)
            cl = self._truncate(calf_length)
            Trl = self._truncate(torso_height)
            ll = self._truncate(leg_length)
            Tra = self._truncate(torso_angle)
            Tha = self._truncate(thigh_uprightness)

            # Encrypt features (simpler 2-component encryption for features)
            encrypted_features = {
                'Tra': self._encrypt_simple(Tra),  # Torso angle
                'Tha': self._encrypt_simple(Tha),  # Thigh uprightness
                'Thl': self._encrypt_simple(Thl),  # Thigh length
                'cl': self._encrypt_simple(cl),    # Calf length
                'Trl': self._encrypt_simple(Trl),  # Torso height
                'll': self._encrypt_simple(ll)     # Leg length
            }

            # Store both raw and encrypted data
            self.pose_data = {
                'label': None,  # Will be determined after HME processing
                'torso_angle': torso_angle,
                'thigh_uprightness': thigh_uprightness,
                'thigh_length': thigh_length,
                'calf_length': calf_length,
                'torso_height': torso_height,
                'leg_length': leg_length,
                'encrypted_features': encrypted_features,
                'raw_int_values': {
                    'Tra': Tra,
                    'Tha': Tha,
                    'Thl': Thl,
                    'cl': cl,
                    'Trl': Trl,
                    'll': ll
                }
            }
            
            self.status = ["encrypted_features_ready"]
            return self.pose_data
            
        except Exception as e:
            print(f"HME pose estimation error: {e}")
            self.status = []
            self.pose_data = {}
            return None

    def perform_hme_comparisons(self, encrypted_features):
        """Analytics: Perform encrypted comparisons"""
        if not self.use_hme:
            return None
            
        try:
            Tra1, Tra2 = encrypted_features.get('Tra', [0, 0])
            Tha1, Tha2 = encrypted_features.get('Tha', [0, 0])
            Thl1, Thl2 = encrypted_features.get('Thl', [0, 0])
            cl1, cl2 = encrypted_features.get('cl', [0, 0])
            Trl1, Trl2 = encrypted_features.get('Trl', [0, 0])
            ll1, ll2 = encrypted_features.get('ll', [0, 0])

            # Threshold values (multiplied by 100 for integer comparison)
            threshold_30 = 3000  # 30.00 degrees
            threshold_40 = 4000  # 40.00 degrees
            threshold_60 = 6000  # 60.00 degrees
            threshold_80 = 8000  # 80.00 degrees

            # Generate random values for homomorphic operations
            r1 = random.randint(1, 2**22 - 1)
            r2 = random.randint(1, 2**10 - 1)

            # Perform comparisons (Algorithm 1: compare with plain threshold)
            T301 = (r2 + (r1 * 2 * (Tra1 - threshold_30))) % p1
            T302 = (r2 + (r1 * 2 * (Tra2 - threshold_30))) % q1
            
            T401 = (r2 + (r1 * 2 * (Tha1 - threshold_40))) % p1
            T402 = (r2 + (r1 * 2 * (Tha2 - threshold_40))) % q1
            
            T801 = (r2 + (r1 * 2 * (Tra1 - threshold_80))) % p1
            T802 = (r2 + (r1 * 2 * (Tra2 - threshold_80))) % q1
            
            T601 = (r2 + (r1 * 2 * (Tha1 - threshold_60))) % p1
            T602 = (r2 + (r1 * 2 * (Tha2 - threshold_60))) % q1

            # Algorithm 2: Compare two encrypted values
            # Compare thigh_length * 10 vs calf_length * 7
            TC1 = (r2 + (r1 * 2 * (Thl1 * 10 - cl1 * 7))) % p1
            TC2 = (r2 + (r1 * 2 * (Thl2 * 10 - cl2 * 7))) % q1
            
            # Compare torso_height * 10 vs leg_length * 5
            TL1 = (r2 + (r1 * 2 * (Trl1 * 10 - ll1 * 5))) % p1
            TL2 = (r2 + (r1 * 2 * (Trl2 * 10 - ll2 * 5))) % q1

            comparison_results = {
                'T30': [T301, T302],
                'T40': [T401, T402],
                'T80': [T801, T802],
                'T60': [T601, T602],
                'TC': [TC1, TC2],
                'TL': [TL1, TL2]
            }

            return comparison_results
            
        except Exception as e:
            print(f"HME comparison error: {e}")
            return None

    def decrypt_comparison_results(self, comparison_results):
        """Caregiver: Decrypt comparison results and determine pose"""
        if not self.use_hme:
            return None
            
        try:
            # Decrypt each comparison result
            T30 = self._decrypt_simple_comparison(comparison_results.get('T30', [0, 0]))
            T40 = self._decrypt_simple_comparison(comparison_results.get('T40', [0, 0]))
            T80 = self._decrypt_simple_comparison(comparison_results.get('T80', [0, 0]))
            T60 = self._decrypt_simple_comparison(comparison_results.get('T60', [0, 0]))
            TC = self._decrypt_simple_comparison(comparison_results.get('TC', [0, 0]))
            TL = self._decrypt_simple_comparison(comparison_results.get('TL', [0, 0]))

            # Convert comparison results to boolean (0: False, 1: True)
            a = 1 if T30 == 1 else 0  # torso_angle > 30
            b = 1 if T40 == 1 else 0  # thigh_uprightness > 40
            c = 1 if T80 == 1 else 0  # torso_angle > 80
            d = 1 if TC == 1 else 0   # thigh_length*10 > calf_length*7
            e = 1 if TL == 1 else 0   # torso_height*10 > leg_length*5
            f = 1 if T60 == 1 else 0  # thigh_uprightness > 60

            # Determine pose using the polynomial logic from pose_estimation_enc_gsplit.py
            # LSB calculation
            lsb = (a & b & d) | (a & ~b) | (~a & ~c & ~f)
            
            # MSB calculation
            msb = (a & b & ~d & e) | ~a
            
            # Combine MSB and LSB
            pose_code = (msb << 1) | lsb
            
            # Map pose code to label
            pose_map = {
                0: "standing",
                1: "sitting",
                2: "bending_down",
                3: "lying_down"
            }
            
            label = pose_map.get(pose_code, "unknown")
            
            # Update pose data
            if 'raw_int_values' in self.pose_data:
                self.pose_data['label'] = label
                self.pose_data['comparison_flags'] = {'a': a, 'b': b, 'c': c, 'd': d, 'e': e, 'f': f}
                self.pose_data['pose_code'] = pose_code
                self.status = [label]
            
            return label
            
        except Exception as e:
            print(f"HME decryption error: {e}")
            return None

    def _decrypt_simple_comparison(self, c_values):
        """Decrypt simple 2-component comparison result"""
        if len(c_values) != 2:
            return 0
            
        c11, c12 = c_values
        mout = (((c11 % p1) * qinvp * q1) + ((c12 % q1) * pinvq * p1)) % n11
        
        # Adjust for negative values
        if mout > n11 // 2:
            mout = mout - n11
        
        mout = mout % u
        bit_length = mout.bit_length()
        
        # Compare with gu (half of u's bit length)
        if gu > bit_length:
            return 0  # m < threshold
        elif gu < bit_length:
            return 1  # m > threshold
        else:
            return -1  # m == threshold (unlikely with randomization)

    def evaluate_pose(self, keypoints):
        """Main entry point: returns pose data dict or None"""
        res = self.feed_keypoints_17(keypoints)
        if res is None:
            return None
        return self.pose_data

    def get_pose_data(self):
        """Get the latest pose data"""
        return self.pose_data

    def is_hme_enabled(self):
        """Check if HME mode is enabled"""
        return self.use_hme
    
    def set_hme_mode(self, enabled):
        """Update HME mode dynamically"""
        self.use_hme = enabled
        if enabled:
            print("[HME] Homomorphic Encryption mode ENABLED")
        else:
            print("[HME] Plain mode ENABLED")
