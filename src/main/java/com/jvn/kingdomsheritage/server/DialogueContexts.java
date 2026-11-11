package com.jvn.kingdomsheritage.server;

import com.jvn.kingdomsheritage.api.DialogueContext;
import com.jvn.kingdomsheritage.compat.EquipmentCompat;
import com.jvn.kingdomsheritage.HeritageConfig;
import com.jvn.kingdomsheritage.data.KitDefinition;
import com.jvn.kingdomsheritage.data.SpawnDefinition;
import java.util.LinkedHashMap;
import java.util.Map;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;

final class DialogueContexts {
    private DialogueContexts() {}

    static DialogueContext create(ServerPlayer player, SpawnDefinition spawn, KitDefinition kit,
                                  HeritageConfig.InventoryPolicy policy, boolean hasKitItems) {
        var members = SelectionParty.members(player);
        var companions = members.stream().filter(member -> member != player).map(member -> member.getGameProfile().getName()).toList();
        var leaderId = SelectionParty.leader(player);
        var leader = members.stream().filter(member -> member.getUUID().equals(leaderId)).findFirst().orElse(player);
        boolean belongings = !player.getInventory().isEmpty()
                || EquipmentCompat.slots(player).stream().anyMatch(slot -> !slot.get().get().isEmpty());
        boolean keeps = belongings && policy != HeritageConfig.InventoryPolicy.REPLACE;
        boolean receives = policy != HeritageConfig.InventoryPolicy.PRESERVE && hasKitItems;
        var title = kit.titleKey().isEmpty() ? Component.literal(kit.title()) : Component.translatableWithFallback(kit.titleKey(), kit.title());
        var equipment = receives ? keeps ? Component.translatable("dialogue.kingdomsheritage.equipment_merged", title) : title
                : Component.translatable("screen.kingdomsheritage." + (keeps ? "review_carried_items" : "review_empty_items"));
        Component names = companions.isEmpty() ? Component.empty() : companions.size() == 1 ? Component.literal(companions.getFirst())
                : Component.translatable("screen.kingdomsheritage." + (companions.size() == 2 ? "review_party_pair" : "review_party_list"),
                        String.join(", ", companions.subList(0, companions.size() - 1)), companions.getLast());
        var values = new LinkedHashMap<String, Component>();
        values.put("player", player.getName());
        values.put("kit", title);
        values.put("spawn", spawn.titleKey().isEmpty() ? Component.literal(spawn.title()) : Component.translatableWithFallback(spawn.titleKey(), spawn.title()));
        values.put("party_leader", leader.getName());
        values.put("party_size", Component.literal(Integer.toString(members.size())));
        values.put("companions", names);
        values.put("equipment", equipment);
        var context = new DialogueContext(values, Map.of("player", player.getGameProfile().getName(), "kit", kit.id().toString(),
                "spawn", spawn.id().toString(), "party_leader", leader.getGameProfile().getName(),
                "party_size", Integer.toString(members.size()), "companions", String.join(", ", companions),
                "inventory_policy", policy.name().toLowerCase(java.util.Locale.ROOT),
                "keeps_belongings", Boolean.toString(keeps), "receives_kit", Boolean.toString(receives)));
        return com.jvn.kingdomsheritage.api.HeritageDialogue.context(player, SelectionLifecycle.state(player), context);
    }
}
