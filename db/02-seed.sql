-- Vault of Our Own — DUMMY data only (fictional usernames, no personal data)
--
-- Accounts (log in by typing the username, no password):
--   dungeonmaster  GM of #1 "The Whatever Adventure" (code VAULT1)  | player in #3
--   mistress_of_dice GM of #2 "Ashes of Kharad"     (code ASHES2)
--   chrysan   player in #1 (Alias Dombret) and #2 (Seren Vale)
--   shoto     player in #1 (Shoto Quickfingers)
--   krow      player in #1 (Krow) and #3
--   newbie         no campaigns yet — use it to test "join with code" / "pick character"
--   lorekeeper     GM of #3 "Tea Party at Ironhold" (code TEA333)

INSERT INTO users (username, display_name) VALUES
 ('dungeonmaster',    'Dungeon Master'),
 ('mistress_of_dice', 'Mistress of Dice'),
 ('lorekeeper',       'Lorekeeper'),
 ('chrysan',     'Chrysan'),
 ('shoto',       'Shoto'),
 ('krow',        'Krow'),
 ('newbie',           'Newbie');

INSERT INTO campaigns (id, code, title, owner, summary, notes, map_public) VALUES
(1, 'VAULT1', 'The Whatever Adventure', 'dungeonmaster',
E'# The Whatever Adventure\n\nThe party wakes up inside the **Vault of Our Own**, a sealed archive beneath the city of *Larn*.\n\n## Goals\n- Find the missing brass key\n- Escape before the tide floods the lower stacks\n\n> "Every book here was written by someone who never left." — inscription on the gate',
E'## GM Notes\n\n> The **Old Librarian** is the villain. Do not reveal before session 4.\n\n- [x] Prepare the map\n- [ ] Plant the clue in session 2\n- [ ] Mimic ambush in the reading room\n\n| Session | Date | Status |\n| --- | --- | --- |\n| 1 | 02 Nov | done |\n| 2 | 16 Nov | planned |',
 TRUE),
(2, 'ASHES2', 'Ashes of Kharad', 'mistress_of_dice',
E'# Ashes of Kharad\n\nA volcanic kingdom is waking up. The party escorts a caravan of ~~gold~~ *seeds* across the ash fields.',
E'## GM Notes\n\n- The caravan master is a disguised dragon.\n- Map stays **hidden** until they reach the ridge.',
 FALSE),
(3, 'TEA333', 'Tea Party at Ironhold', 'lorekeeper',
E'# Tea Party at Ironhold\n\nA one-shot: the dwarven queen invites you to tea. Nobody leaves until the poisoner is found.',
E'## GM Notes\n\nThe poisoner is the teapot (an animated object).',
 TRUE);
SELECT setval('campaigns_id_seq', (SELECT MAX(id) FROM campaigns));

INSERT INTO characters (id, campaign_id, kind, name, race, class_level, age, quote, created_by) VALUES
 -- campaign 1
 (1,  1, 'PC',      'Alias Dombret',     'Half-Elf',   'Bard 3',        '27',  'goyang dombret',             'dungeonmaster'),
 (2,  1, 'PC',      'Shoto Quickfingers', 'Halfling',   'Rogue 3',       '31',  'What lock?',                 'shoto'),
 (3,  1, 'PC',      'Krow',         'Human',      'Bard 2',        '22',  'One more song.',             'krow'),
 (4,  1, 'PC',      'Brakka',            'Dwarf',      'Fighter 3',     '112', 'Stone remembers.',           'dungeonmaster'),
 (5,  1, 'NPC',     'Old Librarian',     'Human',      'Commoner',      '70',  'Shh. The books are sleeping.','dungeonmaster'),
 (6,  1, 'NPC',     'Tide Warden',       'Triton',     'Guard 4',       '45',  'The water does not wait.',   'dungeonmaster'),
 (7,  1, 'MONSTER', 'Vault Mimic',       'Mimic',      'CR 2',          '?',   '*chomp*',                    'dungeonmaster'),
 (8,  1, 'MONSTER', 'Ink Wraith',        'Undead',     'CR 3',          '300', 'Write me back...',           'dungeonmaster'),
 -- campaign 2
 (9,  2, 'PC',      'Seren Vale',        'Tiefling',   'Warlock 5',     '24',  'The ash speaks to me.',      'chrysan'),
 (10, 2, 'NPC',     'Caravan Master Oda','Human?',     'Merchant',      '50',  'Seeds are worth more than gold.','mistress_of_dice'),
 (11, 2, 'MONSTER', 'Ash Drake',         'Dragon',     'CR 6',          '80',  'ROAR',                       'mistress_of_dice'),
 -- campaign 3
 (12, 3, 'PC',      'Sir Crumpet',       'Gnome',      'Paladin 4',     '60',  'Milk first. Always.',        'dungeonmaster'),
 (13, 3, 'PC',      'Lady Earl Grey',    'Elf',        'Wizard 4',      '210', 'Steep, do not stew.',        'krow'),
 (14, 3, 'NPC',     'Queen Hildra',      'Dwarf',      'Noble',         '190', 'Sugar?',                     'lorekeeper'),
 (15, 3, 'MONSTER', 'Animated Teapot',   'Construct',  'CR 1',          '5',   '*whistles menacingly*',      'lorekeeper');
SELECT setval('characters_id_seq', (SELECT MAX(id) FROM characters));

INSERT INTO members (campaign_id, username, role, character_id, joined_at) VALUES
 (1, 'dungeonmaster',    'gm',     NULL, NOW() - INTERVAL '20 days'),
 (1, 'chrysan',     'player', 1,    NOW() - INTERVAL '19 days'),
 (1, 'shoto',       'player', 2,    NOW() - INTERVAL '19 days'),
 (1, 'krow',        'player', 3,    NOW() - INTERVAL '18 days'),
 (2, 'mistress_of_dice', 'gm',     NULL, NOW() - INTERVAL '10 days'),
 (2, 'chrysan',     'player', 9,    NOW() - INTERVAL '9 days'),
 (3, 'lorekeeper',       'gm',     NULL, NOW() - INTERVAL '5 days'),
 (3, 'dungeonmaster',    'player', 12,   NOW() - INTERVAL '4 days'),
 (3, 'krow',        'player', 13,   NOW() - INTERVAL '4 days');
-- note: Brakka (PC #4) is unclaimed on purpose, so a new player can pick it.

INSERT INTO rolls (campaign_id, username, dice, result, created_at) VALUES
 (1, 'chrysan',  'd20', 17, NOW() - INTERVAL '3 hours'),
 (1, 'shoto',    'd20', 2,  NOW() - INTERVAL '170 minutes'),
 (1, 'krow',     'd6',  5,  NOW() - INTERVAL '160 minutes'),
 (1, 'dungeonmaster', 'd100',64, NOW() - INTERVAL '150 minutes'),
 (1, 'chrysan',  'd8',  8,  NOW() - INTERVAL '140 minutes'),
 (1, 'shoto',    'd20', 20, NOW() - INTERVAL '130 minutes'),
 (2, 'chrysan',  'd12', 11, NOW() - INTERVAL '2 days'),
 (2, 'mistress_of_dice','d20',1, NOW() - INTERVAL '2 days'),
 (3, 'krow',     'd4',  3,  NOW() - INTERVAL '1 day'),
 (3, 'dungeonmaster', 'd20', 15, NOW() - INTERVAL '1 day');
