import express from "express";
import bunExpress from "../src";
import session from "express-session";

const PORT = 8080;

const app = bunExpress();

// app.use(cookieParser());

// Use the session middleware
app.use(session({
  secret: "shhh",
  resave: true,
  saveUninitialized: false,
  cookie: { path: '/', httpOnly: true, secure: false, maxAge: 1000 * 60 * 24 },
}));

// Access the session as req.session
app.get('/', (req, res) => {
  const session = (req as any).session;

  if (session.views) {
    session.views++
    res.set('Content-Type', 'text/html')
    res.send('<p>views: ' + session.views + '</p>')
    res.send('<p>expires in: ' + (session.cookie.maxAge / 1000) + 's</p>')
    res.end()
  } else {
    session.views = 1;
    res.end('welcome to the session demo. refresh!')
  }
});

app.listen(PORT, () => console.log("Listening on", PORT));