var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// 予約投稿メッセージ用スキーマ
var ReminderSchema = new Schema(
    {
        targetChannel: { type: String, required: true },
        targetMessageId: { type: String, required: true },
        content: { type: String, required: true },
        attachments: { type: String },
        scheduledAt: { type: Date, index: true },
        posted: { type: Boolean, default: false },
        createdBy: { type: String, required: true }
    },
    {
        timestamps: true
    }
);

const Reminder = mongoose.model('Reminder', ReminderSchema);

module.exports = Reminder;