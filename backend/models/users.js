const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
    },
    passwordHash: {
        type: String,
        required: true,
    },
    questions: [ // likely want to store sorted by date
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Question',
        },
    ],
    streak: Number,
    leetcodeUsername: String,
});

userSchema.set('toJSON', {
    transform: (document, returnedObject) => {
        returnedObject.id = returnedObject._id.toString();
        delete returnedObject._id;
        delete returnedObject.__v;
        delete returnedObject.passwordHash;
        return returnedObject;
    }
});

const User = mongoose.model('User', userSchema);
module.exports = User;