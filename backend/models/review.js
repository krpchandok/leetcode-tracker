const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
    questionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
        required: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    easeFactor: {
        type: Number,
        default: 2.5,
    },
    intervalDays: {
        type: Number,
        default: 1,
    },
    repetitions: {
        type: Number,
        default: 0,
    },
    nextReviewDate: {
        type: Date,
        required: true,
    },
    lastReviewedDate: {
        type: Date,
        default: Date.now,
    },
});

reviewSchema.index({ questionId: 1, userId: 1 }, { unique: true });

reviewSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
        return returnedObject;
    }
});

const Review = mongoose.model('Review', reviewSchema);
module.exports = Review;
