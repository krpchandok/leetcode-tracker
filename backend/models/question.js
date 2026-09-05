const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    questionId: {
        type: mongoose.Schema.Types.ObjectId,
        default: () => new mongoose.Types.ObjectId(),
        unique: true,
    },
    questionNumber: {
        type: Number,
        required: true,
    },
    questionName: {
        type: String,
        required: true,
    },
    questionLink: {
        type: String,
        required: true,
    },
    difficulty: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['solved', 'unsolved', 'in progress'],
        default: 'unsolved',
    },
    needsReview: {
        type: Boolean,
        default: false,
    },
    lastUpdated: {
        type: Date,
        default: Date.now,
    },
});

questionSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
    }
});

const Question = mongoose.model('Question', questionSchema);

module.exports = Question;