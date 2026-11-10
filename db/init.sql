-- Vault of Our Own: schema + dummy seed data (no real personal data)

CREATE TABLE IF NOT EXISTS campaigns (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(6)   NOT NULL UNIQUE,
    title       VARCHAR(120) NOT NULL,
    owner       VARCHAR(40)  NOT NULL,
    summary     TEXT         NOT NULL DEFAULT '',
    notes       TEXT         NOT NULL DEFAULT '',
    map_url     TEXT         NOT NULL DEFAULT '',
    map_public  BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS characters (
    id           SERIAL PRIMARY KEY,
    campaign_id  INT          NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    kind         VARCHAR(8)   NOT NULL CHECK (kind IN ('PC', 'NPC', 'MONSTER')),
    name         VARCHAR(80)  NOT NULL,
    race         VARCHAR(40)  NOT NULL DEFAULT '',
    class_level  VARCHAR(40)  NOT NULL DEFAULT '',
    age          VARCHAR(20)  NOT NULL DEFAULT '',
    quote        VARCHAR(160) NOT NULL DEFAULT '',
    image_url    TEXT         NOT NULL DEFAULT '',
    created_by   VARCHAR(40)  NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
    campaign_id   INT         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    username      VARCHAR(40) NOT NULL,
    role          VARCHAR(8)  NOT NULL CHECK (role IN ('gm', 'player')),
    character_id  INT         REFERENCES characters(id) ON DELETE SET NULL,
    last_seen     TIMESTAMPTZ,
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (campaign_id, username)
);

CREATE TABLE IF NOT EXISTS rolls (
    id           SERIAL PRIMARY KEY,
    campaign_id  INT         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    username     VARCHAR(40) NOT NULL,
    dice         VARCHAR(5)  NOT NULL,
    result       INT         NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rolls_campaign ON rolls (campaign_id, created_at DESC);

-- Dummy seed
INSERT INTO campaigns (code, title, owner, summary, notes, map_public)
VALUES ('VAULT1', 'The Whatever Adventure', 'dungeonmaster',
        E'# The Whatever Adventure\n\nThe party wakes up in the **Vault of Our Own**, a sealed archive beneath the city.\n\n- Find the missing key\n- Escape before the tide\n',
        E'## GM Notes\n\n> The librarian is the villain.\n\n- [ ] Plant the clue in session 2\n- [x] Prepare the map',
        FALSE);

INSERT INTO characters (campaign_id, kind, name, race, class_level, age, quote, created_by) VALUES
 (1, 'PC',      'Alias Dombret', 'Half-Elf', 'Bard 3',     '27',  'goyang dombret',      'dungeonmaster'),
 (1, 'PC',      'Brakka',        'Dwarf',    'Fighter 3',  '112', 'Stone remembers.',    'dungeonmaster'),
 (1, 'NPC',     'Old Librarian', 'Human',    'Commoner',   '70',  'Shh. Books are sleeping.', 'dungeonmaster'),
 (1, 'MONSTER', 'Vault Mimic',   'Mimic',    'CR 2',       '?',   '*chomp*',             'dungeonmaster');

INSERT INTO members (campaign_id, username, role) VALUES (1, 'dungeonmaster', 'gm');
