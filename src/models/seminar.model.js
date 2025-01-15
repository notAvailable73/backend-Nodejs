import mongoose from "mongoose";

const seminarTranslationSchema = new mongoose.Schema({
    language: {
        type: String,
        required: true,
        enum: ['en','bn','ar'],
        lowercase: true
    },
    heading: {
        type: String,
        required: true,
        trim: true 
    },
    description: {
        type: String, 
        trim: true, 
    }, 
    time: {
        type: String,
        required: true
    },
    place: {
        type: String,
        required: true
    },
});
const seminarSchema = new mongoose.Schema({
    translations: [seminarTranslationSchema],
    isFeatured: {
        type: Boolean,
        default: false
    },
}, {
    timestamps: true
});


export const seminar = mongoose.model('Seminar', seminarSchema);