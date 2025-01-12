import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
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
    answers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Answer'
    }],
    isFeatured: {
        type: Boolean,
        default: false
    },
}, {
    timestamps: true
});


const Question = mongoose.model('Question', questionSchema);