package com.jvn.kingdomsheritage;

import net.neoforged.neoforge.common.ModConfigSpec;

public final class HeritageConfig {
    public enum InventoryPolicy { REPLACE, MERGE, PRESERVE }

    public static final ModConfigSpec SPEC;
    public static final ModConfigSpec CLIENT_SPEC;
    public static final ModConfigSpec.BooleanValue SELECTION_MUSIC;
    public static final ModConfigSpec.EnumValue<InventoryPolicy> INVENTORY_POLICY;
    public static final ModConfigSpec.BooleanValue EXEMPT_EXISTING_PLAYERS;
    public static final ModConfigSpec.BooleanValue HOMELAND_RESPAWN;
    public static final ModConfigSpec.IntValue RANDOM_RADIUS;
    public static final ModConfigSpec.IntValue SEARCH_RADIUS;

    static {
        var builder = new ModConfigSpec.Builder();
        RANDOM_RADIUS = builder.defineInRange("randomSpawnRadius", 2000, 16, 30000);
        SEARCH_RADIUS = builder.defineInRange("locationSearchRadius", 6400, 256, 30000);
        INVENTORY_POLICY = builder.defineEnum("inventoryPolicy", InventoryPolicy.MERGE);
        EXEMPT_EXISTING_PLAYERS = builder.define("exemptExistingPlayers", true);
        HOMELAND_RESPAWN = builder.define("homelandRespawn", false);
        SPEC = builder.build();
        var client = new ModConfigSpec.Builder();
        SELECTION_MUSIC = client.define("selectionMusic", true);
        CLIENT_SPEC = client.build();
    }

    private HeritageConfig() {}
}
