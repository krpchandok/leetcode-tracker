const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema({
    titleSlug: {
        type: String,
        required: true,
        unique: true,
    },
    questionId: {
        type: Number,
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    difficulty: {
        type: String,
        enum: ['Easy', 'Medium', 'Hard'],
    },
    topicTags: {
        type: [String],
        default: [],
    },
    isPaidOnly: {
        type: Boolean,
        default: false,
    },
    lastSynced: {
        type: Date,
        default: Date.now,
    },
});

problemSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
        return returnedObject;
    }
});

const Problem = mongoose.model('Problem', problemSchema);
module.exports = Problem;
