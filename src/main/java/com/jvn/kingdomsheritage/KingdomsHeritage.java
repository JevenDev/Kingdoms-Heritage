package com.jvn.kingdomsheritage;

import com.mojang.logging.LogUtils;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import org.slf4j.Logger;

@Mod(KingdomsHeritage.MOD_ID)
public final class KingdomsHeritage {
    public static final String MOD_ID = "kingdomsheritage";
    public static final Logger LOGGER = LogUtils.getLogger();

    public KingdomsHeritage(IEventBus modEventBus, ModContainer container) {
        LOGGER.info("Kingdoms: Heritage loaded");
    }
}
