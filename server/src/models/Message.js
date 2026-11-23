import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    // Denormalised owner → every message query can be scoped to the user.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    model: { type: String }, // which LLM produced an assistant reply
    // Assistant reply cut short because the user pressed Stop / disconnected.
    stopped: { type: Boolean, default: undefined },
  },
  { timestamps: true },
);

messageSchema.index({ conversation: 1, createdAt: 1 });

messageSchema.methods.toJSON = function toJSON() {
  return {
    id: this._id.toString(),
    role: this.role,
    content: this.content,
    createdAt: this.createdAt,
    ...(this.model && { model: this.model }),
    ...(this.stopped && { stopped: true }),
  };
};

export const Message = mongoose.model('Message', messageSchema);
