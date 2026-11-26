import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  readHeat,
  type Heat,
  type Camera,
  type Mark,
  type Result,
} from "./model";
import "./style.css";

type Bundle = { heat: Heat; urls: Map<string, string>; example: boolean };
type Pick = { cameraId: string; before?: number; after?: number };

function CameraPane({
  camera,
  urls,
  example,
  select,
}: {
  camera: Camera;
  urls: Map<string, string>;
  example: boolean;
  select: (side: "before" | "after", index: number) => void;
}) {
  const [i, setI] = useState(0);
  const [loaded, setLoaded] = useState("");
  const frame = camera.frames[i];
  const src = example ? "/example/" + frame.file : urls.get(frame.file);
  return (
    <article className="camera">
      <header>
        <strong>Finish {camera.id}</strong>
        <span>
          Frame {i + 1} / {camera.frames.length}
        </span>
      </header>
      <img
        key={src}
        src={src}
        alt={"Finish " + camera.id + " • frame " + (i + 1)}
        onLoad={() => setLoaded(src || "")}
        onError={() => setLoaded("")}
      />
      <div className="controls">
        <button
          disabled={!i}
          onClick={() => setI(i - 1)}
          aria-label={"Previous frame " + camera.id}
        >
          ←
        </button>
        <input
          aria-label={"Frame " + camera.id}
          type="range"
          min="0"
          max={camera.frames.length - 1}
          value={i}
          onChange={(e) => setI(Number(e.target.value))}
        />
        <button
          disabled={i === camera.frames.length - 1}
          onClick={() => setI(i + 1)}
          aria-label={"Next frame " + camera.id}
        >
          →
        </button>
      </div>
      <div className="actions">
        <button
          disabled={!src || loaded !== src}
          onClick={() => select("before", i)}
        >
          Mark before
        </button>
        <button
          disabled={!src || loaded !== src}
          onClick={() => select("after", i)}
        >
          Mark at / after
        </button>
      </div>
    </article>
  );
}

function Workspace({ bundle }: { bundle: Bundle }) {
  const [heat, setHeat] = useState(bundle.heat);
  const [lane, setLane] = useState(heat.roster[0].lane);
  const [pick, setPick] = useState<Pick>();
  const [results, setResults] = useState<Result[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  function commit(mark?: Mark) {
    revision.current++;
    const marks = heat.marks.filter((m) => m.lane !== lane);
    if (mark) marks.push(mark);
    setHeat({ ...heat, marks });
    setPick(undefined);
    setResults([]);
    setStatus("");
  }
  async function evaluate() {
    const version = revision.current;
    setBusy(true);
    setStatus("");
    try {
      const r = await fetch("/api/timing/replays/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(heat),
      });
      if (!r.ok)
        throw Error(
          (await r.json().catch(() => ({}))).message ||
            "Calculation failed. Check the API connection.",
        );
      const rows: Result[] = await r.json();
      if (version === revision.current) {
        setResults(rows);
        setStatus("Reviewed frame intervals calculated.");
      }
    } catch (e) {
      if (version === revision.current)
        setStatus(e instanceof Error ? e.message : "Calculation failed.");
    } finally {
      setBusy(false);
    }
  }
  function exportHeat() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(heat, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "heat.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const saved = heat.marks.find((m) => m.lane === lane);
  const valid =
    pick?.before !== undefined &&
    pick.after !== undefined &&
    pick.before < pick.after;
  return (
    <>
      <section className="heading">
        <div>
          <small>
            {bundle.example
              ? "Synthetic example · illustrated frames"
              : "Imported heat · phone-video review"}
          </small>
          <h1>{heat.title}</h1>
        </div>
        <button onClick={exportHeat}>Export review</button>
      </section>
      <div className="layout">
        <aside>
          <h2>Race roster</h2>
          <p>
            {heat.marks.length} of {heat.roster.length} crossings marked
          </p>
          {heat.roster.map((r) => (
            <button
              className={"athlete " + (lane === r.lane ? "chosen" : "")}
              key={r.lane}
              onClick={() => {
                setLane(r.lane);
                setPick(undefined);
              }}
            >
              <b>{r.lane}</b>
              {r.name}
              <span>
                {heat.marks.some((m) => m.lane === r.lane) ? "✓" : "—"}
              </span>
            </button>
          ))}
        </aside>
        <section className="work">
          <h2>
            Lane {lane} · {heat.roster.find((r) => r.lane === lane)?.name}
          </h2>
          <p>
            Choose one camera. Mark the last frame before the torso reaches the
            line and the first frame at or after it.
          </p>
          <div className="cameras">
            {heat.cameras.map((c) => (
              <CameraPane
                key={c.id}
                camera={c}
                example={bundle.example}
                urls={bundle.urls}
                select={(side, index) =>
                  setPick((prev) => ({
                    ...(prev?.cameraId === c.id ? prev : {}),
                    cameraId: c.id,
                    [side]: index,
                  }))
                }
              />
            ))}
          </div>
          <div className="decision">
            <div>
              {pick
                ? "Finish " +
                  pick.cameraId +
                  " · before " +
                  (pick.before === undefined ? "—" : pick.before + 1) +
                  " · at / after " +
                  (pick.after === undefined ? "—" : pick.after + 1)
                : saved
                  ? "Saved · Finish " +
                    saved.cameraId +
                    " · frames " +
                    (saved.before + 1) +
                    "–" +
                    (saved.after + 1)
                  : "Crossing unresolved"}
            </div>
            <button
              className="primary"
              disabled={!valid}
              onClick={() => {
                if (valid && pick)
                  commit({
                    lane,
                    cameraId: pick.cameraId,
                    before: pick.before!,
                    after: pick.after!,
                  });
              }}
            >
              Save crossing
            </button>
            <button onClick={() => commit()} disabled={!pick && !saved}>
              Leave unresolved
            </button>
          </div>
        </section>
      </div>
      <section className="summary">
        <header>
          <div>
            <h2>Heat results</h2>
            <p>
              Intervals reflect the selected frames on the supplied clock
              calibration. Overlapping intervals can leave place unresolved.
            </p>
          </div>
          <button disabled={busy} onClick={evaluate}>
            {busy ? "Calculating…" : "Calculate intervals"}
          </button>
        </header>
        <p role="status">{status}</p>
        {results.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Lane</th>
                <th>Athlete</th>
                <th>Elapsed frame interval</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.lane}>
                  <td>{r.lane}</td>
                  <td>{r.name}</td>
                  <td>
                    {r.earliestUs === null
                      ? "Unresolved"
                      : (r.earliestUs / 1e6).toFixed(6) +
                        " – " +
                        (r.latestUs! / 1e6).toFixed(6) +
                        " s"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function App() {
  const [bundle, setBundle] = useState<Bundle>();
  const [error, setError] = useState("");
  const [key, setKey] = useState(0);
  const request = useRef(0);
  const files = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      bundle?.urls.forEach((url) => URL.revokeObjectURL(url));
    },
    [bundle],
  );
  async function load(selection?: File[]) {
    const id = ++request.current;
    const urls = new Map<string, string>();
    try {
      let heat: Heat;
      if (selection) {
        const manifests = selection.filter((f) => f.name.endsWith(".json"));
        if (manifests.length !== 1)
          throw Error(
            "Select one heat JSON and all of its frame images together.",
          );
        heat = readHeat(JSON.parse(await manifests[0].text()));
        for (const f of selection.filter((f) => f !== manifests[0])) {
          if (urls.has(f.name)) throw Error("Duplicate filename: " + f.name);
          urls.set(f.name, URL.createObjectURL(f));
        }
        for (const c of heat.cameras)
          for (const f of c.frames)
            if (!urls.has(f.file)) throw Error("Missing frame: " + f.file);
      } else {
        const r = await fetch("/example/heat.json");
        heat = readHeat(await r.json());
      }
      if (id !== request.current) {
        urls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      setBundle({ heat, urls, example: !selection });
      setKey((k) => k + 1);
      setError("");
    } catch (e) {
      urls.forEach((url) => URL.revokeObjectURL(url));
      if (id === request.current)
        setError(e instanceof Error ? e.message : "Import failed.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <main>
      <nav>
        <strong>
          TRAFICO <em>Timing</em>
        </strong>
        <button onClick={() => files.current?.click()}>
          Import heat &amp; frames
        </button>
      </nav>
      <input
        ref={files}
        hidden
        type="file"
        multiple
        accept=".json,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          if (e.target.files?.length) void load([...e.target.files]);
          e.target.value = "";
        }}
      />
      {error && <p role="alert">{error}</p>}
      {bundle && <Workspace key={key} bundle={bundle} />}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
