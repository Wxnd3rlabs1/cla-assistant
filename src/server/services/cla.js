// models
require('../documents/cla');
require('../documents/user');
var https = require('https');
var User = require('mongoose').model('User');
var CLA = require('mongoose').model('CLA');

//services
var github = require('../services/github');
var url = require('../services/url');
var repoService = require('../services/repo');
var status = require('../services/status');

module.exports = {
	getGist: function(args, done){
		try{
			var gistArray = args.gist.split('gists/'); // https://api.github.com/gists/60e9b5d7ce65ca474c29/ce4fb76a7dd1d7b120202b448809157958f61a03
			gistArray = gistArray.length > 1 ? gistArray : args.gist.split('/'); // https://gist.github.com/KharitonOff/60e9b5d7ce65ca474c29

		} catch(ex) {
			done('The gist url "' + args.gist + '" seems to be invalid');
			return;
		}

		var path = '/gists/';
		var id = gistArray[gistArray.length - 1].split('/');
		path += id[0];
		if (id[1]) {
			path = path + '/' + id[1];
		}

		var req = {};
		var data = '';
		var options = {
			hostname: config.server.github.api,
			port: 443,
			path: path,
			method: 'GET',
			headers: {
				'Authorization': 'token ' + args.token,
				'User-Agent': 'cla-assistant'
			}
		};

		req = https.request(options, function(res){
			res.on('data', function(chunk) { data += chunk; });
			res.on('end', function(){
				data = JSON.parse(data);
				done(null, data);
			});
		});

		req.end();
		req.on('error', function (e) {
			done(e);
		});
	},
	getRepo: function(args, done) {
		repoService.get(args, function(err, repo){
			done(err, repo);
		});
	},

    get: function(args, done) {
		CLA.findOne({repo: args.repo, owner: args.owner, user: args.user, gist_url: args.gist, gist_version: args.gist_version}, function(err, cla){
            done(err, cla);
        });
    },

    check: function(args, done){
		var self = this;

		this.getRepo(args, function(err, repo){
			if (err || !repo) {
				done(err);
				return;
			}

			args.gist = repo.gist;

			self.getGist(repo, function(err, gist){
				args.gist_version = gist.history[0].version;

				self.get(args, function(err, cla){

					done(err, !!cla);
				});
			});
		});
    },

    sign: function(args, done) {
		var now = new Date();
		var self = this;

		self.check(args, function(err, signed){
			if (err || signed) {
				done(err);
				return;
			}

			self.getRepo(args, function(err, repo){
				if (err || !repo) {
					done(err);
					return;
				}

				args.gist_url = repo.gist;

				self.create(args, function(){
					User.findOne({uuid: args.user_id}, function(err, user){
						if (!err) {
							var number;
							try{
								user.requests.forEach(function(request){
									status.update({
										user: args.user,
										owner: args.owner,
										repo_uuid: request.repo.id,
										repo: request.repo.name,
										sha: request.sha,
										signed: true
									});
									number = request.number;
								});

								user.requests.length = 0;
								user.save();

								done(err, {pullRequest: number});
							} catch (ex) {
								done(err);
							}
						} else {
							done(err);
						}
					});
				});
			});
		});
    },

    getAll: function(args, done) {
		var self = this;
		var valid = [];
		CLA.find({repo: args.repo, owner: args.owner, gist_url: args.gist}, function(err, clas){
			if (!clas) {
				done(err, clas);
				return;
			}
			self.getRepo(args, function(err, repo){
				self.getGist(repo, function(err, gist){
					if (!gist) {
						done(err, gist);
						return;
					}
					clas.forEach(function(cla){
						if (gist.history.length > 0 && gist.history[0].version === cla.gist_version) {
							valid.push(cla);
						}
					});
					done(err, valid);
				});
			});
        });
    },
    create: function(args, done){
		var guid = function(){
			return 'xxxxxxxxxxxxx'.replace(/[x]/g, function(c) {
				var r = Math.floor(Math.random() * 10);
				return r.toString();
			});
		};

		var now = new Date();

		CLA.create({uuid: guid(), repo: args.repo, owner: args.owner, user: args.user, gist_url: args.gist, gist_version: args.gist_version, created_at: now}, function(err, res){
			done(err, res);
		});

		// var cla = new CLA({uuid: guid(), repo: args.repo, owner: args.owner, user: args.user, gist_url: args.gist, created_at: now});
		// cla.save(done);
    },
    remove: function(args, done){
		var string = '';
		CLA.where('uuid').gte(1).exec( function(err, data){
			console.log(data);
			data.forEach(function(entry){
				CLA.remove({uuid: entry.uuid}).exec();
				string = string + '; repo: ' + entry.repo + ' user: ' + entry.user;
			});
			done(string);
		});
    }
};
