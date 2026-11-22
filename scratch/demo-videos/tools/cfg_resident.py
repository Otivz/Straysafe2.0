import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
import lib
import importlib.util, sys
# reuse the narration dict of the recording script without running it
src = open(os.path.join(HERE, 'rec_resident.py'), encoding='utf8').read()
ns = {}
start = src.index('N = {'); end = src.index('\n}\n', start) + 3
exec(src[start:end], ns)
N = ns['N']
tt = lib.tts_all({'intro': N['intro'], 'outro': N['outro']})
cfg = {
 'name': 'resident', 'timeline': os.path.join(HERE, 'rec', 'resident_timeline.json'),
 'output': 'STRAYSAFE_Resident_Demonstration.mp4', 'layout': 'phone',
 'title': 'Resident User Demonstration', 'role_tag': 'RESIDENT WALKTHROUGH',
 'intro_sub': 'For residents of the subdivision', 'outro_sub': 'Thank you for watching',
 'intro_wav': tt['intro'][0], 'outro_wav': tt['outro'][0],
 'video_pos': [1380, 140, 397, 860], 'caption_w': 1000, 'caption_pos': [110, 1000], 'caption_size': 30,
 'scene_labels': [['login', 'Sign in'], ['home', 'Dashboard'], ['features', 'Features'], ['report', 'Report'], ['pets', 'Pets & QR'], ['settings', 'Updates']],
 'panels': {
  'login': {'kicker': 'SCENE 2  ·  LOGIN', 'title': 'Welcome and sign in', 'bullets': ['Sign in with your email and password', 'New residents can create an account', 'The password is hidden as you type']},
  'home': {'kicker': 'SCENE 2  ·  DASHBOARD', 'title': 'Your Home screen', 'bullets': ['A greeting with your name and subdivision', 'Shortcuts: my pet is lost, I found an animal, my pets', 'Your reports and recent conversations', 'Latest notices from your Leader']},
  'features': {'kicker': 'SCENE 3  ·  FEATURES', 'title': 'Community and tools', 'bullets': ['Community: lost pets, found animals, advisories', 'A notice never shows who reported', 'Scan a pet tag with the phone camera', 'Profile: pets, notifications, warnings, settings, help']},
  'report': {'kicker': 'SCENE 4  ·  REPORTING', 'title': 'Reporting an animal', 'bullets': ['Three choices: lost pet, animal complaint, report an animal', 'A clear photo is required', 'The location must be inside the reporting area', 'Review, then submit: an administrator checks it before anything is shared']},
  'pets': {'kicker': 'SCENE 5  ·  PETS', 'title': 'Pets and QR tags', 'bullets': ['Register a pet with its name, kind, colours and photo', 'A registration is a declaration, not proof of ownership', 'Each pet gets a QR tag', 'A QR collar can be requested from the office']},
  'settings': {'kicker': 'SCENE 5  ·  UPDATES', 'title': 'Notifications and settings', 'bullets': ['Notifications about your reports and notices', 'Choose updates in the app or by email', 'Change your password and review privacy']},
 }}
json.dump(cfg, open(os.path.join(HERE, 'cfg_resident.json'), 'w', encoding='utf8'), indent=1)
print('ok')
