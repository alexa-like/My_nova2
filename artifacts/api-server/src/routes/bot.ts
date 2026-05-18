import { Router } from "express";
import { User } from "../bot/models/User.js";
import { RedeemCode } from "../bot/models/RedeemCode.js";
import { Memory } from "../bot/models/Memory.js";
import { GroupSettings } from "../bot/models/GroupSettings.js";
import { getBot } from "../bot/index.js";

const router = Router();

router.get("/bot/status", async (req, res) => {
  const bot = getBot();
  if (!bot) {
    res.json({ status: "offline", message: "Bot is not running" });
    return;
  }
  try {
    const info = await bot.getMe();
    const totalUsers = await User.countDocuments();
    const premiumUsers = await User.countDocuments({ "premium.active": true });
    const bannedUsers = await User.countDocuments({ banned: true });
    const totalCodes = await RedeemCode.countDocuments();
    const usedCodes = await RedeemCode.countDocuments({ used: true });
    const memories = await Memory.countDocuments();
    const groups = await GroupSettings.countDocuments();
    const activeToday = await User.countDocuments({
      lastSeen: { $gte: new Date(Date.now() - 86400000) },
    });

    res.json({
      status: "online",
      bot: {
        id: info.id,
        username: info.username,
        name: info.first_name,
      },
      stats: {
        totalUsers,
        premiumUsers,
        bannedUsers,
        activeToday,
        totalGroups: groups,
        redeemCodes: { total: totalCodes, used: usedCodes },
        memoryEntries: memories,
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Failed to get bot info" });
  }
});

export default router;
