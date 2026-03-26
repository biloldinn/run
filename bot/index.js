require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const userState = {};

// --- HELPERS ---
const getMainMenu = (role) => {
    if (role === 'employee') {
        return {
            keyboard: [
                [{ text: "💼 Mening buyurtmalarim" }, { text: "📊 Mening statistikam" }],
                [{ text: "ℹ️ Ma'lumotlarim" }, { text: "🔄 Yangilash" }]
            ],
            resize_keyboard: true
        };
    }
    return {
        keyboard: [
            [{ text: "🚕 Buyurtma berish" }, { text: "📦 Buyurtmalarim holati" }],
            [{ text: "👤 Profilim" }, { text: "📞 Bog'lanish" }]
        ],
        resize_keyboard: true
    };
};

// --- START ---
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    let user = await User.findOne({ telegramId: chatId });

    if (!user) {
        user = new User({
            telegramId: chatId,
            firstName: msg.from.first_name,
            lastName: msg.from.last_name || '',
            role: 'client'
        });
        await user.save();
    }

    const welcomeMsg = `✨ **Turon Zakas Ultimate** xizmatiga xush kelibsiz!\n\nBiz bilan buyurtma berish yanada oson va tezkor. Quyidagi menyudan foydalaning:`;
    bot.sendMessage(chatId, welcomeMsg, {
        parse_mode: 'Markdown',
        reply_markup: getMainMenu(user.role)
    });
});

// --- HANDLE MESSAGES ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const user = await User.findOne({ telegramId: chatId });

    if (!user || text.startsWith('/')) return;

    // CLIENT ACTIONS
    if (text === "🚕 Buyurtma berish") {
        userState[chatId] = { step: 'from' };
        bot.sendMessage(chatId, "📍 **Qayerdan ketasiz?**\n(Tuman, shahar yoki manzilni yozing)", {
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true }
        });
    }

    else if (text === "👤 Profilim" || text === "ℹ️ Ma'lumotlarim") {
        const profileInfo = `👤 **Profil Ma'lumotlari**\n\n🆔 ID: \`${user.telegramId}\`\n📝 Ism: ${user.firstName} ${user.lastName}\n📞 Tel: ${user.phone || 'Kiritilmagan'}\n⭐ Reyting: ${user.averageRating}\n✅ Jami zakazlar: ${user.totalOrders}`;
        bot.sendMessage(chatId, profileInfo, { parse_mode: 'Markdown', reply_markup: getMainMenu(user.role) });
    }

    else if (text === "📞 Bog'lanish") {
        const contactInfo = `📞 **Biz bilan bog'lanish**\n\nSavollar yoki takliflar bo'lsa, @admin bilan bog'laning yoki +99890XXXXXXX raqamiga qo'ng'iroq qiling.`;
        bot.sendMessage(chatId, contactInfo, { parse_mode: 'Markdown' });
    }

    else if (text === "🔄 Yangilash") {
        bot.sendMessage(chatId, "🔄 Ma'lumotlar yangilandi.", { reply_markup: getMainMenu(user.role) });
    }

    else if (text === "📊 Mening statistikam" && user.role === 'employee') {
        const stats = `📊 **Sizning unumdorligingiz**\n\n✅ Bajarilgan zakazlar: ${user.totalOrders}\n⭐ O'rtacha baho: ${user.averageRating}\n🏆 Reytingdagi o'rningizni Admin panelda ko'rishingiz mumkin.`;
        bot.sendMessage(chatId, stats, { parse_mode: 'Markdown' });
    }

    else if (text === "📦 Buyurtmalarim holati") {
        const orders = await Order.find({ "client.telegramId": chatId }).sort({ "timestamps.created": -1 }).limit(5);
        if (orders.length === 0) return bot.sendMessage(chatId, "Hozircha buyurtmalaringiz yo'q.");

        let msgText = "📦 **Oxirgi 5 ta buyurtmangiz:**\n\n";
        orders.forEach((o, i) => {
            const statusEmoji = o.status === 'completed' ? '✅' : o.status === 'cancelled' ? '❌' : '⏳';
            msgText += `${i + 1}. ${o.details.from} ➡️ ${o.details.to}\nHolati: ${statusEmoji} ${o.status.toUpperCase()}\n\n`;
        });
        bot.sendMessage(chatId, msgText, { parse_mode: 'Markdown' });
    }

    // ORDER FLOW
    else if (userState[chatId]) {
        const state = userState[chatId];
        if (state.step === 'from') {
            state.from = text;
            state.step = 'to';
            bot.sendMessage(chatId, "🏁 **Qayerga borasiz?**", { parse_mode: 'Markdown' });
        } else if (state.step === 'to') {
            state.to = text;
            state.step = 'description';
            bot.sendMessage(chatId, "📝 **Qo'shimcha ma'lumot:**\n(Masalan: 2 ta sumka bor, benzin quyish kerak va h.k.)", { parse_mode: 'Markdown' });
        } else if (state.step === 'description') {
            state.description = text;

            const order = new Order({
                client: {
                    firstName: user.firstName,
                    lastName: user.lastName,
                    telegramId: chatId
                },
                details: {
                    from: state.from,
                    to: state.to,
                    description: state.description
                }
            });
            await order.save();
            delete userState[chatId];

            bot.sendMessage(chatId, "✅ **Buyurtmangiz muvaffaqiyatli yuborildi!**\n\nAdmin tez orada hodim biriktiradi. Iltimos, kuting.", {
                parse_mode: 'Markdown',
                reply_markup: getMainMenu(user.role)
            });
        }
    }
});

// --- CALLBACK QUERIES ---
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data.startsWith('rate_')) {
        const [_, orderId, stars] = data.split('_');
        const order = await Order.findById(orderId).populate('employee');

        if (order && !order.rating.stars) {
            order.rating.stars = parseInt(stars);
            await order.save();

            const employee = order.employee;
            if (employee) {
                employee.ratings.push({ stars: parseInt(stars), orderId: order._id });
                employee.updateRating();
                await employee.save();
            }

            bot.editMessageText(`🌟 **Rahmat!** Siz bizning xizmatni ${stars} ballga baholadingiz.`, {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown'
            });
        }
    }

    else if (data.startsWith('complete_')) {
        const orderId = data.split('_')[1];
        const order = await Order.findById(orderId);

        if (order && order.status !== 'completed') {
            order.status = 'completed';
            order.timestamps.completed = new Date();
            await order.save();

            // Increment employee order count
            const employee = await User.findById(order.employee);
            if (employee) {
                employee.totalOrders = (employee.totalOrders || 0) + 1;
                await employee.save();
            }

            const ratingButtons = {
                inline_keyboard: [
                    [{ text: "⭐", callback_data: `rate_${orderId}_1` },
                    { text: "⭐⭐", callback_data: `rate_${orderId}_2` },
                    { text: "⭐⭐⭐", callback_data: `rate_${orderId}_3` },
                    { text: "⭐⭐⭐⭐", callback_data: `rate_${orderId}_4` },
                    { text: "⭐⭐⭐⭐⭐", callback_data: `rate_${orderId}_5` }]
                ]
            };

            bot.sendMessage(order.client.telegramId, `✅ **Xizmat uchun rahmat!**\n\n💰 To'lov miqdori: \`${order.details.price}\` so'm.\n🤝 Hodim: ${employee.firstName}\n\nIltimos, ish sifatini baholang:`, {
                parse_mode: 'Markdown',
                reply_markup: ratingButtons
            });

            bot.sendMessage(chatId, "✅ **Buyurtma yakunlandi.** Statistika yangilandi.");
        }
    }

    else if (data.startsWith('ready_')) {
        const orderId = data.split('_')[1];
        const order = await Order.findById(orderId).populate('employee');

        if (order && order.status === 'assigned') {
            order.status = 'ready';
            order.timestamps.ready = new Date();
            await order.save();

            bot.sendMessage(order.client.telegramId, `🚀 **Buyurtmangiz tayyor!**\n\n🚖 Hodim: ${order.employee.firstName}\n📞 Tel: ${order.employee.phone || 'Botda kiritilmagan'}\n🏁 Tez orada manzilingizda bo'ladi.`);
            bot.sendMessage(chatId, "✅ Mijozga yo'lga chiqqaningiz haqida xabar yuborildi.");
        }
    }
});

console.log("🤖 Telegram Bot running with Premium UX...");
module.exports = bot;
