package com.jvn.kingdomsheritage;

import net.neoforged.neoforge.common.ModConfigSpec;

public final class HeritageConfig {
    public static final ModConfigSpec SPEC;
    public static final ModConfigSpec.IntValue RANDOM_RADIUS;
    public static final ModConfigSpec.IntValue SEARCH_RADIUS;

    static {
        var builder = new ModConfigSpec.Builder();
        RANDOM_RADIUS = builder.defineInRange("randomSpawnRadius", 2000, 16, 30000);
        SEARCH_RADIUS = builder.defineInRange("locationSearchRadius", 6400, 256, 30000);
        SPEC = builder.build();
    }

    private HeritageConfig() {}
}
