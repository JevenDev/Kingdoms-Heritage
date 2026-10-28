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
        container.registerConfig(net.neoforged.fml.config.ModConfig.Type.SERVER, HeritageConfig.SPEC);
        modEventBus.addListener(com.jvn.kingdomsheritage.network.HeritageNetwork::register);
        modEventBus.addListener((net.neoforged.neoforge.event.AddPackFindersEvent event) -> event.addPackFinders(
                net.minecraft.resources.ResourceLocation.fromNamespaceAndPath(MOD_ID, "backgrounds"),
                net.minecraft.server.packs.PackType.SERVER_DATA,
                net.minecraft.network.chat.Component.translatable("pack.kingdomsheritage.backgrounds"),
                net.minecraft.server.packs.repository.PackSource.create(
                        net.minecraft.server.packs.repository.PackSource.BUILT_IN::decorate, false), false,
                net.minecraft.server.packs.repository.Pack.Position.TOP));
        net.neoforged.neoforge.common.NeoForge.EVENT_BUS.addListener(com.jvn.kingdomsheritage.data.HeritageCatalog::register);
        net.neoforged.neoforge.common.NeoForge.EVENT_BUS.addListener(com.jvn.kingdomsheritage.server.KitService::commands);
        net.neoforged.neoforge.common.NeoForge.EVENT_BUS.addListener(com.jvn.kingdomsheritage.server.HeritageCommands::register);
        net.neoforged.neoforge.common.NeoForge.EVENT_BUS.register(com.jvn.kingdomsheritage.server.SelectionManager.class);
    }
}
