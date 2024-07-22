var mongoose = require('mongoose');
var Schema = mongoose.Schema;

// フォーラム更新情報用スキーマ
var InfoSchema = new Schema(
    {
        type: { type: String, enum: ["client-update", "server-update", "bug-fix", "news"], required: true },
        url: { type: String, required: true },
        posted: { type: Boolean, default: false },
    },
    {
        timestamps: true
    }
);

const Info = mongoose.model('Info', InfoSchema);

module.exports = Info;