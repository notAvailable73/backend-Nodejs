import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true, 
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        unique: true
    } ,
    role: {
        type: String,
        default: 'user',
        enum: ['subscriber', 'admin', 'user']
    },
    askedQuestions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question'
    }],
}, {
    timestamps: true
});


export const User = mongoose.model('User', userSchema);