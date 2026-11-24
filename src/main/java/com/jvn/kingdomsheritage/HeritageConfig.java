package com.jvn.kingdomsheritage;

import java.util.List;
import net.neoforged.neoforge.common.ModConfigSpec;

public final class HeritageConfig {
    public enum InventoryPolicy { REPLACE, MERGE, PRESERVE }
    public enum SelectionMusicMode { ALTERNATE, ORIGINAL, SOLACE }

    public static final ModConfigSpec SPEC;
    public static final ModConfigSpec CLIENT_SPEC;
    public static final ModConfigSpec.BooleanValue SELECTION_MUSIC;
    public static final ModConfigSpec.EnumValue<SelectionMusicMode> SELECTION_MUSIC_MODE;
    public static final ModConfigSpec.EnumValue<InventoryPolicy> INVENTORY_POLICY;
    public static final ModConfigSpec.BooleanValue EXEMPT_EXISTING_PLAYERS;
    public static final ModConfigSpec.BooleanValue HOMELAND_RESPAWN;
    public static final ModConfigSpec.IntValue RANDOM_RADIUS;
    public static final ModConfigSpec.IntValue SEARCH_RADIUS;
    public static final ModConfigSpec.IntValue STRUCTURE_SEARCH_RADIUS;
    public static final ModConfigSpec.IntValue STRUCTURE_SEARCH_CANDIDATES;
    public static final ModConfigSpec.IntValue STRUCTURE_SEARCH_TIMEOUT;
    public static final ModConfigSpec.IntValue BIOME_SEARCH_RADIUS;
    public static final ModConfigSpec.ConfigValue<List<? extends String>> SCREEN_ORDER;
    public static final ModConfigSpec.ConfigValue<List<? extends String>> DISABLED_SCREENS;

    static {
        var builder = new ModConfigSpec.Builder();
        RANDOM_RADIUS = builder.defineInRange("randomSpawnRadius", 2000, 16, 30000);
        SEARCH_RADIUS = builder.defineInRange("locationSearchRadius", 6400, 256, 30000);
        STRUCTURE_SEARCH_RADIUS = builder.comment("Maximum radius for expanding structure searches without an explicit search_radius. Location Search Radius controls the initial area.")
                .defineInRange("structureSearchRadius", 100000, 256, 1000000);
        STRUCTURE_SEARCH_CANDIDATES = builder.comment("Maximum candidate placements to check for one structure destination, including locations with an explicit search_radius.")
                .defineInRange("structureSearchMaxCandidates", 512, 1, 65536);
        STRUCTURE_SEARCH_TIMEOUT = builder.comment("Maximum seconds to find a structure and prepare a safe arrival, including time waiting for chunks.")
                .defineInRange("structureSearchTimeoutSeconds", 60, 1, 600);
        BIOME_SEARCH_RADIUS = builder.comment("Maximum radius for biome searches without an explicit search_radius.")
                .defineInRange("biomeSearchRadius", 100000, 256, 1000000);
        INVENTORY_POLICY = builder.defineEnum("inventoryPolicy", InventoryPolicy.MERGE);
        EXEMPT_EXISTING_PLAYERS = builder.define("exemptExistingPlayers", true);
        HOMELAND_RESPAWN = builder.define("homelandRespawn", true);
        builder.push("screenFlow");
        SCREEN_ORDER = builder.comment("Order overrides within each declared placement, for example examplevr:setup=200. Applied on server startup.")
                .defineListAllowEmpty("order", List.<String>of(), value -> value instanceof String);
        DISABLED_SCREENS = builder.comment("Optional screen IDs to disable. Unknown IDs and disabling required steps prevent server startup.")
                .defineListAllowEmpty("disabled", List.<String>of(), value -> value instanceof String);
        builder.pop();
        SPEC = builder.build();
        var client = new ModConfigSpec.Builder();
        SELECTION_MUSIC = client.define("selectionMusic", true);
        SELECTION_MUSIC_MODE = client.comment("ALTERNATE switches tracks on each new character creation session. ORIGINAL and SOLACE always play that track.")
                .defineEnum("selectionMusicMode", SelectionMusicMode.ALTERNATE);
        CLIENT_SPEC = client.build();
    }

    private HeritageConfig() {}
}
