package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import com.jvn.kingdomsheritage.data.HeritageCatalog;
import com.jvn.kingdomsheritage.data.HeritageException;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.brigadier.exceptions.SimpleCommandExceptionType;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.TagKey;
import net.neoforged.neoforge.event.RegisterCommandsEvent;

public final class HeritageCommands {
    private HeritageCommands() {}

    public static void register(RegisterCommandsEvent event) {
        event.getDispatcher().register(Commands.literal("heritage")
                .then(Commands.literal("background").executes(context -> background(context.getSource(), context.getSource().getPlayerOrException())))
                .then(Commands.literal("inspect").requires(source -> source.hasPermission(2))
                        .then(Commands.argument("player", EntityArgument.player()).executes(context ->
                                inspect(context.getSource(), EntityArgument.getPlayer(context, "player")))))
                .then(Commands.literal("validate").requires(source -> source.hasPermission(2))
                        .executes(context -> validate(context.getSource(), context.getSource().getPlayer()))
                        .then(Commands.argument("player", EntityArgument.player()).executes(context ->
                                validate(context.getSource(), EntityArgument.getPlayer(context, "player")))))
                .then(Commands.literal("reset").requires(source -> source.hasPermission(2))
                        .then(Commands.argument("player", EntityArgument.player()).executes(context ->
                                change(context.getSource(), EntityArgument.getPlayer(context, "player"), false))))
                .then(Commands.literal("recover").requires(source -> source.hasPermission(2))
                        .then(Commands.argument("player", EntityArgument.player()).executes(context ->
                                change(context.getSource(), EntityArgument.getPlayer(context, "player"), true)))));
    }

    private static int background(CommandSourceStack source, ServerPlayer player) {
        var state = SelectionManager.inspect(player);
        var spawn = HeritageCatalog.spawns().get(ResourceLocation.tryParse(state.getString("spawn_choice")));
        var kit = HeritageCatalog.kits().get(ResourceLocation.tryParse(state.getString("kit_choice")));
        if (state.getString("spawn_choice").isEmpty() && state.getString("kit_choice").isEmpty()) {
            source.sendSuccess(() -> Component.translatable("commands.kingdomsheritage.no_background"), false);
            return 1;
        }
        Component homeland = spawn == null ? Component.literal(state.getString("spawn_choice"))
                : spawn.titleKey().isEmpty() ? Component.literal(spawn.title()) : Component.translatableWithFallback(spawn.titleKey(), spawn.title());
        Component equipment = kit == null ? Component.literal(state.getString("kit_choice"))
                : kit.titleKey().isEmpty() ? Component.literal(kit.title()) : Component.translatableWithFallback(kit.titleKey(), kit.title());
        source.sendSuccess(() -> Component.translatable("commands.kingdomsheritage.background", homeland, state.getString("homeland_dimension"), equipment), false);
        return 1;
    }

    private static int inspect(CommandSourceStack source, ServerPlayer player) {
        var state = SelectionManager.inspect(player);
        source.sendSuccess(() -> Component.translatable("commands.kingdomsheritage.inspect", player.getDisplayName(),
                state.getBoolean("pending"), state.getBoolean("complete"), state.getString("spawn_choice"),
                state.getString("kit_choice"), state.getString("homeland_dimension")), false);
        return 1;
    }

    private static int change(CommandSourceStack source, ServerPlayer player, boolean recover) throws CommandSyntaxException {
        try {
            if (recover) SelectionManager.recover(player);
            else SelectionManager.reset(player);
        } catch (IllegalArgumentException error) {
            throw new SimpleCommandExceptionType(HeritageException.component(error)).create();
        }
        source.sendSuccess(() -> Component.translatable(recover ? "commands.kingdomsheritage.recovered"
                : "commands.kingdomsheritage.reset", player.getDisplayName()), true);
        return 1;
    }

    private static int validate(CommandSourceStack source, ServerPlayer player) {
        int errors = 0;
        for (var spawn : HeritageCatalog.spawns().values()) {
            try {
                var level = source.getServer().getLevel(ResourceKey.create(Registries.DIMENSION, spawn.dimension()));
                if (level == null) throw new HeritageException("dimension", "Dimension is unavailable: %s", spawn.dimension().toString());
                if (spawn.kind() == SpawnDefinition.Kind.BIOME) {
                    SpawnResolver.validateBiome(level, spawn);
                } else if (spawn.kind() == SpawnDefinition.Kind.STRUCTURE) {
                    var registry = level.registryAccess().registryOrThrow(Registries.STRUCTURE);
                    boolean tag = registry.getTag(TagKey.create(Registries.STRUCTURE, spawn.target())).filter(value -> value.size() > 0).isPresent();
                    if (!tag && (spawn.targetTag() || !registry.containsKey(spawn.target()))) {
                        throw new HeritageException("structure", "Unknown or empty structure target: %s", spawn.target().toString());
                    }
                    if (!source.getServer().getWorldData().worldGenOptions().generateStructures()) {
                        throw new HeritageException("structures_disabled", "Structure generation is disabled in this world");
                    }
                } else if (spawn.kind() == SpawnDefinition.Kind.FIXED) {
                    var position = new BlockPos(spawn.x(), spawn.y(), spawn.z());
                    if (!level.getWorldBorder().isWithinBounds(position) || spawn.y() <= level.getMinBuildHeight()
                            || spawn.y() + 2 >= level.getMaxBuildHeight()) throw new HeritageException("fixed_bounds", "Fixed position is outside the playable bounds");
                }
            } catch (IllegalArgumentException error) {
                source.sendFailure(Component.translatable("commands.kingdomsheritage.invalid", spawn.id().toString(), HeritageException.component(error)));
                errors++;
            }
        }
        for (var kit : HeritageCatalog.kits().values()) {
            try {
                var entries = kit.decode(source.registryAccess());
                if (player != null) EquipmentCompat.validate(player, entries);
            } catch (IllegalArgumentException error) {
                source.sendFailure(Component.translatable("commands.kingdomsheritage.invalid", kit.id().toString(), HeritageException.component(error)));
                errors++;
            }
        }
        int total = errors;
        source.sendSuccess(() -> Component.translatable("commands.kingdomsheritage.validated",
                HeritageCatalog.spawns().size(), HeritageCatalog.kits().size(), total), false);
        if (player == null) source.sendSuccess(() -> Component.translatable("commands.kingdomsheritage.validation_player"), false);
        return errors == 0 ? 1 : 0;
    }
}
