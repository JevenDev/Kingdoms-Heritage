package com.jvn.kingdomsheritage.server;

import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import com.jvn.kingdomsheritage.data.KitDefinition;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.serialization.JsonOps;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.util.List;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.RegistryOps;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.storage.LevelResource;
import net.neoforged.neoforge.event.RegisterCommandsEvent;

public final class KitService {
    private KitService() {}

    public static void apply(ServerPlayer player, KitDefinition kit, List<KitDefinition.StackEntry> entries) {
        var slots = EquipmentCompat.slots(player);
        var inventory = player.getInventory();
        var previous = inventory.items.stream().map(ItemStack::copy).toList();
        var previousArmor = inventory.armor.stream().map(ItemStack::copy).toList();
        ItemStack offhand = inventory.offhand.getFirst().copy();
        var equipment = slots.stream().map(slot -> slot.get().get().copy()).toList();
        int selected = inventory.selected;
        try {
            inventory.clearContent();
            slots.forEach(slot -> slot.set().accept(ItemStack.EMPTY));
            for (var entry : entries) {
                if (entry.inventory().equals("player")) inventory.setItem(entry.index(), entry.stack().copy());
                else slots.stream().filter(slot -> slot.matches(entry)).findFirst().orElseThrow()
                        .set().accept(entry.stack().copy());
            }
            inventory.selected = kit.selectedSlot();
            inventory.setChanged();
            player.inventoryMenu.broadcastChanges();
        } catch (RuntimeException error) {
            for (int index = 0; index < previous.size(); index++) inventory.items.set(index, previous.get(index));
            for (int index = 0; index < previousArmor.size(); index++) inventory.armor.set(index, previousArmor.get(index));
            inventory.offhand.set(0, offhand);
            inventory.selected = selected;
            for (int index = 0; index < slots.size(); index++) slots.get(index).set().accept(equipment.get(index));
            inventory.setChanged();
            player.inventoryMenu.broadcastChanges();
            throw error;
        }
    }

    public static void commands(RegisterCommandsEvent event) {
        event.getDispatcher().register(Commands.literal("heritage").requires(source -> source.hasPermission(2))
                .then(Commands.literal("exportkit").then(Commands.argument("name", StringArgumentType.word())
                        .executes(context -> export(context.getSource().getPlayerOrException(),
                                StringArgumentType.getString(context, "name"))))));
    }

    private static int export(ServerPlayer player, String name) {
        if (!name.matches("[a-z0-9][a-z0-9_-]{0,63}")) {
            player.sendSystemMessage(Component.literal("Use a kit name containing lowercase letters, numbers, underscores or hyphens"));
            return 0;
        }
        JsonObject json = new JsonObject();
        json.addProperty("title", name);
        json.addProperty("description", "");
        json.addProperty("selected_slot", player.getInventory().selected);
        JsonArray items = new JsonArray();
        for (int index = 0; index < player.getInventory().getContainerSize(); index++) {
            add(items, player, "player", "", index, false, player.getInventory().getItem(index));
        }
        for (var slot : EquipmentCompat.slots(player)) {
            add(items, player, slot.inventory(), slot.name(), slot.index(), slot.cosmetic(), slot.get().get());
        }
        json.add("items", items);
        var path = player.server.getWorldPath(LevelResource.ROOT).resolve("heritage_exports").resolve(name + ".json");
        try {
            Files.createDirectories(path.getParent());
            Files.writeString(path, new GsonBuilder().setPrettyPrinting().create().toJson(json) + "\n",
                    StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
            player.sendSystemMessage(Component.literal("Exported " + path + ". Copy it to data/<namespace>/heritage/kits/" + name + ".json in your datapack"));
            return 1;
        } catch (java.nio.file.FileAlreadyExistsException error) {
            player.sendSystemMessage(Component.literal("An export named " + name + " already exists. Choose another name"));
            return 0;
        } catch (IOException error) {
            com.jvn.kingdomsheritage.KingdomsHeritage.LOGGER.warn("Could not export kit {}", path, error);
            player.sendSystemMessage(Component.literal("Kit export failed: " + error.getMessage() + ". Existing exports are never overwritten"));
            return 0;
        }
    }

    private static void add(JsonArray items, ServerPlayer player, String inventory, String slot, int index,
                            boolean cosmetic, ItemStack stack) {
        if (stack.isEmpty()) return;
        JsonObject entry = new JsonObject();
        entry.addProperty("inventory", inventory);
        if (!slot.isEmpty()) entry.addProperty("slot", slot);
        entry.addProperty("index", index);
        if (cosmetic) entry.addProperty("cosmetic", true);
        entry.add("item", ItemStack.CODEC.encodeStart(RegistryOps.create(JsonOps.INSTANCE, player.registryAccess()), stack)
                .getOrThrow(IllegalArgumentException::new));
        items.add(entry);
    }
}
