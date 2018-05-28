const mongoose = require('../settings/database');
const Schema = mongoose.Schema;
const usersScoreLogSchema = new Schema({
	uid: {
		type: String,
		default: '',
		index: 1
	},
	targetUid: {
		type: String,
		default: '',
		index: 1
	},
	score: {
		type: Number,
		default: 0,
		index: 1
	},
	targetScore: {
		type: Number,
		default: 0,
		index: 1
	},
	operationId: {
		type: String,
		required: true,
		index: 1
	},
	toc: {
		type: Date,
		default: Date.now,
		index: 1
	},
	tid: {
		type: String,
		default: '',
		index: 1
	},
	fid: {
		type: String,
		default: '',
		index: 1
	},
	pid: {
		type: String,
		default: '',
		index: 1
	}
}, {
	collection: 'usersScoreLogs'
});

const UsersScoreLogModel = mongoose.model('usersScoreLogs', usersScoreLogSchema);

module.exports = UsersScoreLogModel;