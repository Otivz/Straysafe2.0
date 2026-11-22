import json, os, lib
from rec_leader import N
HERE = os.path.dirname(os.path.abspath(__file__))
tt = lib.tts_all({'intro': N['intro'], 'outro': N['outro']})
cfg = {'name': 'leader', 'timeline': os.path.join(HERE, 'rec', 'leader_timeline.json'),
 'output': 'STRAYSAFE_Subdivision_Leader_Demonstration.mp4', 'layout': 'desktop',
 'title': 'Subdivision Leader User Demonstration', 'role_tag': 'SUBDIVISION LEADER WALKTHROUGH',
 'intro_sub': 'For Subdivision Leaders, HOA officers and authorized personnel', 'outro_sub': 'Thank you for watching',
 'intro_wav': tt['intro'][0], 'outro_wav': tt['outro'][0],
 'video_pos': [288, 120, 1344, 756], 'caption_w': 1344, 'caption_pos': [288, 1014], 'caption_size': 24,
 'scene_labels': [['login', 'Sign in'], ['dashboard', 'Dashboard'], ['reports', 'Reports'], ['verify', 'Verification'], ['more', 'More tools']]}
json.dump(cfg, open(os.path.join(HERE, 'cfg_leader.json'), 'w', encoding='utf8'), indent=1); print('ok')
