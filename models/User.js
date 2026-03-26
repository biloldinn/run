const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    firstName: String,
    lastName: String,
    username: { type: String, unique: true, sparse: true }, // For Admin/Web Login
    phone: { type: String, unique: true },
    password: { type: String }, // Hashed
    role: { type: String, enum: ['admin', 'employee', 'client'], default: 'client' },
    telegramId: { type: String, unique: true, sparse: true },
    ratings: [{
        stars: Number,
        comment: String,
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
        createdAt: { type: Date, default: Date.now }
    }],
    averageRating: { type: Number, default: 0 },
    totalOrders: { type: Number, default: 0 },
    isOnline: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Update average rating before saving
UserSchema.methods.updateRating = function() {
    if (this.ratings.length === 0) return;
    const sum = this.ratings.reduce((a, b) => a + b.stars, 0);
    this.averageRating = Number((sum / this.ratings.length).toFixed(1));
};

module.exports = mongoose.model('User', UserSchema);
