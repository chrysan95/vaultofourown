-- Vault of Our Own — schema
-- Roles are per campaign: exactly one Game Master (gm) per campaign, everyone else is a player.

CREATE TABLE IF NOT EXISTS users (
    username      VARCHAR(40) PRIMARY KEY,
    display_name  VARCHAR(80) NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(6)   NOT NULL UNIQUE,
    title       VARCHAR(120) NOT NULL,
    owner       VARCHAR(40)  NOT NULL REFERENCES users(username),
    summary     TEXT         NOT NULL DEFAULT '',
    notes       TEXT         NOT NULL DEFAULT '',      -- GM only
    map_url     TEXT         NOT NULL DEFAULT '',
    map_public  BOOLEAN      NOT NULL DEFAULT FALSE,   -- FALSE = GM only, TRUE = everyone
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
    created_by   VARCHAR(40)  NOT NULL REFERENCES users(username)
);

CREATE TABLE IF NOT EXISTS members (
    campaign_id   INT         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    username      VARCHAR(40) NOT NULL REFERENCES users(username),
    role          VARCHAR(8)  NOT NULL CHECK (role IN ('gm', 'player')),
    character_id  INT         REFERENCES characters(id) ON DELETE SET NULL,
    last_seen     TIMESTAMPTZ,
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (campaign_id, username),
    -- the Game Master never plays a PC
    CONSTRAINT gm_has_no_character CHECK (role = 'player' OR character_id IS NULL)
);

-- one Game Master per campaign
CREATE UNIQUE INDEX IF NOT EXISTS one_gm_per_campaign ON members (campaign_id) WHERE role = 'gm';
-- one player per PC
CREATE UNIQUE INDEX IF NOT EXISTS one_player_per_pc ON members (character_id) WHERE character_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS rolls (
    id           SERIAL PRIMARY KEY,
    campaign_id  INT         NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    username     VARCHAR(40) NOT NULL REFERENCES users(username),
    dice         VARCHAR(5)  NOT NULL,
    result       INT         NOT NULL CHECK (result >= 1),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rolls_campaign ON rolls (campaign_id, created_at DESC);
