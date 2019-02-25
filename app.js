const path = require('path');
const fs = require('fs');
const express = require('express');
const app = express();
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const multer = require('multer');

app.use(helmet());

// ### Passport Setup ###
const session = require('express-session');
app.use(session({
    secret: 'qwe/.,e',
    resave: false,
    saveUninitialized: true
  }))
const passport = require('passport');
const GitHubStrategy = require('passport-github').Strategy;
app.use(passport.initialize());
app.use(passport.session());
const passportConfig = require('./config');

passport.use(new GitHubStrategy(passportConfig,
  function(accessToken, refreshToken, profile, cb) {
    // User.findOrCreate({ githubId: profile.id }, function (err, user) {
    //   return cb(err, user);
    // });
    return cb(null, profile);
  }
));
passport.serializeUser((user, cb) => {
    return cb(null, user);
});
passport.deserializeUser((user, cb) => {
    return cb(null, user);
})
//

// ### Multer Setup ###
function getExtension(fileName){
    const dotIndex = Array.prototype.lastIndexOf.call(fileName, '.');
    return fileName.split('').slice(dotIndex).join('');
}

const storage = multer.diskStorage({
    destination: function(req, file, cb){
        cb(null, './public/uploads/');
    },
    filename: function(req, file, cb){
        const extension = getExtension(file.originalname);
        cb(null, req.cookies.username + extension);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if(file.mimetype.search('image')) {
            return cb(new Error('illegalFileType'));
        }
        return cb(null, true);
    },
    onError: (err, next) => {
        next(err);
    }
})
//

// ### Deletes previous userImage after new upload ###
function deleteUserImage(req, res, next){
    const acceptedExtensions = ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.JPG', '.bmp'];
    acceptedExtensions.forEach(char => {
        if(fs.existsSync(`./public/uploads/${req.cookies.username+char}`) 
            && req.file.filename !== req.cookies.username+(char).toLowerCase()){ //Since fs sees .JPG and .jpg as equivalent
                fs.unlinkSync(`./public/uploads/${req.cookies.username+char}`);
        }
    })

    next();
}
//

app.use(express.json());
app.use(express.urlencoded({
    extended: true
}))
app.use(cookieParser());
app.use(express.static('public'));

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'));

// ### Respond to expected errors ###
app.use((req, res, next) => {
    switch(req.query.status){
        case 'failedLogin':
            res.locals.msg = "Password-username pair did not exist.";
            break;
        case 'illegalAccessAttempt':
            res.locals.msg = "Please login before visiting that page.";
            break;
        case 'illegalFileType':
            res.locals.msg = "Uploaded file was not an image!";
            break;
        default:
            res.locals.msg = '';
    }
    next();
})
//

//### Login routing ###
app.get('/', (req, res, next) => {
    res.redirect(req.cookies.username ? '/welcome' : '/login');
})
app.get('/login', (req, res, next) => {
    res.render('login');
})

app.get('/auth', 
  passport.authenticate('github', { 
    failureRedirect: '/login?status=failedLogin', 
    successRedirect: '/process_github-login'
}));

app.get('/process_github-login', (req, res, next) => {
    res.cookie('username', req.user.username);
    const users = JSON.parse(fs.readFileSync('./db-mock/db.json'));
    if(!users.find(char => char.username === req.user.username)){
        users.push({username: req.user.username, fileName: null});
        fs.writeFileSync('./db-mock/db.json', JSON.stringify(users));
    }
    res.redirect('/welcome');
});

app.post('/process_login', (req, res, next) => {
    const db = JSON.parse(fs.readFileSync('./db-mock/db.json'))
    const username = req.body.username;
    const password = req.body.password;
    if(db.filter(user => user.username === username && user.password === password).length > 0){
        res.cookie('username', username);
        res.redirect('/welcome');
    } else {
        next(new Error('failedLogin'));
    }
});
//

//### Main page routing ###
app.get('/welcome', (req, res, next) => {
    const users = JSON.parse(fs.readFileSync('./db-mock/db.json'));
    const targetUser = users.find(char => char.username === req.cookies.username);
    if(req.cookies.username){
        res.render('welcome', {
            username: req.cookies.username,
            image: `<img src="${'/uploads/' + (targetUser.fileName || 'default.png')}"/>`
        });
    } else {
        next(new Error('illegalAccessAttempt'));
    }
})

app.post('/process_upload-image', upload.single('userImage'), deleteUserImage, (req, res, next) => {
    const users = JSON.parse(fs.readFileSync('./db-mock/db.json'));
    users.map((char, i) => {
        if(char.username === req.cookies.username){
            users[i].fileName = req.file.filename; 
        }
    })
    fs.writeFileSync('./db-mock/db.json', JSON.stringify(users));
    res.redirect('/welcome');
});

app.get('/logout', (req, res, next) => {
    res.clearCookie('username');
    res.redirect('/login');
});
//

// ### Error Handling ###
app.use((err, req, res, next) => {
    const expectedErrs = ['failedLogin', 'illegalAccessAttempt', 'illegalFileType'];
    if(expectedErrs.filter(error => error === err.message).length > 0){
        if(req.cookies.username){
            res.redirect(`/welcome?status=${err.message}`);
        } else {
            res.redirect(`/login?status=${err.message}`);
        }
    } else { 
        throw err;
    }
})

app.use(function (req, res, next) {
    res.status(404).send("404 -- PAGE NOTE FOUND")
})
//

app.listen(3000);