import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 100 },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Sidebar query: "my conversations, most recent first".
conversationSchema.index({ user: 1, lastMessageAt: -1 });

conversationSchema.methods.toJSON = function toJSON() {
  return {
    id: this._id.toString(),
    title: this.title,
    lastMessageAt: this.lastMessageAt,
    createdAt: this.createdAt,
  };
};

export const Conversation = mongoose.model('Conversation', conversationSchema);
