import mongoose from "mongoose";

const questionTranslationSchema = new mongoose.Schema({
    language: {
        type: String,
        required: true,
        enum: ['en','bn','ar'],
        lowercase: true
    },
    title: {
        type: String,
        required: true,
        trim: true 
    },
    description: {
        type: String,
        required: true,
        trim: true, 
    }, 
    tags: {
        type: [String],
        required: true
    },
    answer: [{
        type: String,
        default: null
    }]
});

const questionSchema = new mongoose.Schema({
    translations: [questionTranslationSchema],
    isFeatured: {
        type: Boolean,
        default: false
    },
}, {
    timestamps: true
});


export const Question = mongoose.model('Question', questionSchema);