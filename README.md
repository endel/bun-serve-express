# Bun.serve + Express

Express API compatibility layer for `Bun.serve`. Highly similar to [uWebSockets-express](https://github.com/colyseus/uWebSockets-express/).

## Usage

```typescript
import bunExpress from "bun-serve-express";

const app = bunExpress(/* optional serve options */);

// use existing middleware implementations!
app.use(express.json());
app.use('/', serveIndex(path.join(__dirname, ".."), { icons: true, hidden: true }))
app.use('/', express.static(path.join(__dirname, "..")));

// register routes
app.get("/hello", (req, res) => {
  res.json({ hello: "world!" });
});

app.listen(8000);
```

## License

MIT
