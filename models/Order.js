const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    client: {
        firstName: String,
        lastName: String,
        phone: String,
        telegramId: String
    },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    details: {
        from: String,
        to: String,
        description: String,
        price: Number
    },
    status: {
        type: String,
        enum: ['pending', 'assigned', 'ready', 'completed', 'cancelled'],
        default: 'pending'
    },
    payment: {
        method: { type: String, default: 'cash' },
        status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
        checkPhoto: String
    },
    rating: {
        stars: Number,
        comment: String
    },
    timestamps: {
        created: { type: Date, default: Date.now },
        assigned: Date,
        ready: Date,
        completed: Date
    }
});

module.exports = mongoose.model('Order', OrderSchema);
