require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');

const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

const userState = {}; // Temp state for orders

// --- HELPERS ---
const getMainMenu = (role) => {
    if (role === 'employee') {
        return { keyboard: [[{ text: "💼 Mening zakazlarim" }, { text: "📊 Reytingim" }]], resize_keyboard: true };
    }
    return { keyboard: [[{ text: "🚕 Zakaz berish" }, { text: "📦 Mening buyurtmalarim" }]], resize_keyboard: true };
};

// --- START ---
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    let user = await User.findOne({ telegramId: chatId });

    if (!user) {
        user = new User({
            telegramId: chatId,
            firstName: msg.from.first_name,
            lastName: msg.from.last_name,
            role: 'client'
        });
        await user.save();
    }

    bot.sendMessage(chatId, `Assalomu alaykum, ${user.firstName}!\nTuron Zakas xizmatiga xush kelibsiz.`, {
        reply_markup: getMainMenu(user.role)
    });
});

// --- HANDLE MESSAGES ---
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const user = await User.findOne({ telegramId: chatId });

    if (!user) return;

    if (text === "🚕 Zakaz berish") {
        userState[chatId] = { step: 'from' };
        bot.sendMessage(chatId, "Qayerdan ketasiz? (Tuman/Shahar)", { reply_markup: { remove_keyboard: true } });
    }

    else if (userState[chatId]) {
        const state = userState[chatId];
        if (state.step === 'from') {
            state.from = text;
            state.step = 'to';
            bot.sendMessage(chatId, "Qayerga borasiz?");
        } else if (state.step === 'to') {
            state.to = text;
            state.step = 'description';
            bot.sendMessage(chatId, "Buyurtma haqida qisqacha ma'lumot (masalan: 2 kishi, 1 ta yuk):");
        } else if (state.step === 'description') {
            state.description = text;

            // Create Order
            const order = new Order({
                client: {
                    firstName: user.firstName,
                    lastName: user.lastName,
                    phone: user.phone,
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

            bot.sendMessage(chatId, "✅ Buyurtmangiz qabul qilindi. Admin tasdiqlashini kuting.", {
                reply_markup: getMainMenu(user.role)
            });

            // Notify Admin (You can implement admin notification here)
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

            // Update employee rating
            const employee = order.employee;
            if (employee) {
                employee.ratings.push({ stars: parseInt(stars), orderId: order._id });
                employee.updateRating();
                await employee.save();
            }

            bot.editMessageText(`Rahmat! Siz ${stars} ball berdingiz.`, {
                chat_id: chatId,
                message_id: query.message.message_id
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

            // Notify Client
            const ratingButtons = {
                inline_keyboard: [
                    [{ text: "⭐", callback_data: `rate_${orderId}_1` },
                    { text: "⭐⭐", callback_data: `rate_${orderId}_2` },
                    { text: "⭐⭐⭐", callback_data: `rate_${orderId}_3` },
                    { text: "⭐⭐⭐⭐", callback_data: `rate_${orderId}_4` },
                    { text: "⭐⭐⭐⭐⭐", callback_data: `rate_${orderId}_5` }]
                ]
            };

            bot.sendMessage(order.client.telegramId, `✅ Buyurtmangiz yakunlandi!\nTo'lov: ${order.details.price} so'm.\nIltimos, xizmatni baholang:`, {
                reply_markup: ratingButtons
            });

            bot.sendMessage(chatId, "✅ Buyurtma yakunlandi deb belgilandi.");
        }
    }

    else if (data.startsWith('ready_')) {
        const orderId = data.split('_')[1];
        const order = await Order.findById(orderId);

        if (order && order.status === 'assigned') {
            order.status = 'ready';
            order.timestamps.ready = new Date();
            await order.save();

            bot.sendMessage(order.client.telegramId, "🚀 Buyurtmangiz tayyor! Hodim yo'lga chiqdi.");
            bot.sendMessage(chatId, "✅ Mijozga xabar yuborildi.");
        }
    }
});

console.log("🤖 Telegram Bot running...");
module.exports = bot;
