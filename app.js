const path = require('path');
const fs = require('fs');
const express = require('express');
const app = express();
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const multer = require('multer');

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
        const extension = getExtension(file.originalname);
        const acceptedExtensions = ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.JPG', '.bmp'];
        if (!(acceptedExtensions.filter(ext => ext === extension).length > 0)) {
            return cb(new Error('illegalFileType'));
        }
        return cb(null, true);
    },
    onError: (err, next) => {
        next(err);
    }
})

function deleteUserImage(req, res, next){
    const acceptedExtensions = ['.png', '.jpg', '.jpeg', '.tif', '.tiff', '.JPG', '.bmp'];
    acceptedExtensions.forEach(char => {
        if(fs.existsSync(`./public/uploads/${req.cookies.username+char}`)){
            fs.unlinkSync(`./public/uploads/${req.cookies.username+char}`);
        }
    })

    next();
}

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({
    extended: true
}))
app.use(cookieParser());
app.use(express.static('public'));

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, 'views'));

app.use((req, res, next) => {
    switch(req.query.status){
        case 'failedLogin':
            res.locals.msg = "Password-username pair did not exist.";
            break;
        case 'illegalAccessAttempt':
            res.locals.msg = "Please login before visiting that page.";
            break;
        case 'illegalFileType':
            res.locals.msg = "Only .png, .jpg, .jpeg, .JPG, .tif, .tiff, and .bmp files are supported";
            break;
        default:
            res.locals.msg = '';
    }
    next();
})

app.get('/', (req, res, next) => {
    res.redirect(req.cookies.username ? '/welcome' : '/login');
})
app.get('/login', (req, res, next) => {
    res.render('login');
})
app.get('/welcome', (req, res, next) => {
    if(req.cookies.username){
        res.render('welcome', {
            username: req.cookies.username,
            image: `<img src="${'/uploads/' + req.cookies.filename}"/>`
        });
    } else {
        next(new Error('illegalAccessAttempt'));
    }
})

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
})

app.post('/process_upload-image', deleteUserImage, upload.single('user-image'), (req, res, next) => {
    res.cookie('filename', req.file.filename);
    res.redirect('/welcome');
})

app.get('/logout', (req, res, next) => {
    res.clearCookie('username');
    res.redirect('/login');
})

app.use((err, req, res, next) => {
    const expectedErrs = ['failedLogin', 'illegalAccessAttempt', 'illegalFileType'];
    if(expectedErrs.filter(error => error === err.message).length > 0){
        if(req.cookies.username){
            res.redirect(`/welcome?status=${err.message}`);
        } else {
            res.redirect(`/login?status=${err.message}`);
        }
    }
})

app.listen(3000);