import {
  AirAirport,
  AirGate,
  BusBerth,
  BusStop,
  GD,
  Node,
  LocatedNode,
  RailPlatform,
  RailStation,
  SeaDock,
  SeaStop,
  SpawnWarp,
  BusLine,
  SeaLine,
  RailLine,
  Town,
  type ID,
  type AirMode,
} from "gatelogue-types";
import $ from "jquery";
import select2 from "select2";
import "select2/dist/css/select2.css";
// @ts-expect-error
select2($);

const htmlFrom = document.getElementById("from")! as HTMLSelectElement;
const htmlTo = document.getElementById("to")! as HTMLSelectElement;
const htmlOut = document.getElementById("out")! as HTMLDivElement;
const htmlGo = document.getElementById("go")! as HTMLButtonElement;
const htmlFromRandom = document.getElementById(
  "from-random",
)! as HTMLButtonElement;
const htmlToRandom = document.getElementById("to-random")! as HTMLButtonElement;
const gd = await GD.get();

function displayNode(node: Node) {
  let [codes, name]: [string | string[], string | string[]] = (
    node instanceof AirAirport
      ? [node.code, node.names]
      : node instanceof BusStop ||
          node instanceof SeaStop ||
          node instanceof RailStation
        ? [node.codes, node.name ?? ""]
        : node instanceof BusLine ||
            node instanceof SeaLine ||
            node instanceof RailLine
          ? [node.code, node.name ?? ""]
          : node instanceof SpawnWarp
            ? ["", node.name]
            : node instanceof Town
              ? ["", node.name]
              : undefined
  )!;
  if (Array.isArray(codes)) {
    codes = codes.join("/");
  }
  if (Array.isArray(name)) {
    name = name.join("/");
  }

  if (codes && name) {
    return `${name} (${codes})`;
  } else if (!name) {
    return codes;
  } else {
    return name;
  }
}

function setupDropdown() {
  let options: [number, string][] = [];
  for (const node of gd.locatedNodes) {
    let option =
      node instanceof AirAirport
        ? `${node.names?.join("/")} (${node.code})`
        : node instanceof BusStop
          ? `[${node.company.name}] ` + displayNode(node)
          : node instanceof RailStation
            ? `[${node.company.name}] ` + displayNode(node)
            : node instanceof SeaStop
              ? `[${node.company.name}] ` + displayNode(node)
              : node instanceof SpawnWarp
                ? `${node.name}`
                : node instanceof Town
                  ? `${node.name} (${node.rank})`
                  : `unknown node ${node}`;

    options.push([node.i, `${node.constructor.name} ${option}`]);
  }
  const optionsString = options
    .sort(([_, a], [__, b]) => a.localeCompare(b))
    .map(([i, o]) => `<option value="${i}">${o}</option>`)
    .join();
  htmlFrom.innerHTML = optionsString;
  htmlTo.innerHTML = optionsString;
}
setupDropdown();

function randomDest(field: HTMLSelectElement) {
  const children = field.children;
  const option = children[
    Math.floor(Math.random() * children.length)
  ] as HTMLOptionElement;
  field.value = option.value;
  $(field).select2();
}
htmlFromRandom.addEventListener("click", () => randomDest(htmlFrom));
htmlToRandom.addEventListener("click", () => randomDest(htmlTo));
randomDest(htmlFrom);
randomDest(htmlTo);

const MODES = [
  "air",
  "sea",
  "bus",
  "rail",
  "spawn-warp",
  "traincarts",
  "warp",
  "vehicles",
  "cart",
] as const;
const SPEEDS = {
  walk: 6,
  walk10: 15,
  fly: 20,
  fly10: 100,
};
type DijkstraConfig = {
  WARP_COST: number;
  FLYING_MPS: number;
  TRAINCART_MPS: number;
  TRAINCART_LOCAL_MPS: number;
  CART_MPS: number;
  CHANGING_COST: number;
  ROUTE_BY: Set<(typeof MODES)[number]>;
};

const CONFIG: DijkstraConfig = {
  WARP_COST: 5,
  FLYING_MPS: SPEEDS["fly"],
  TRAINCART_MPS: 50,
  TRAINCART_LOCAL_MPS: 20,
  CART_MPS: 8,
  CHANGING_COST: 15,
  ROUTE_BY: new Set(MODES),
};

function setupProxRadioButtons() {
  for (const [id, speed] of Object.entries(SPEEDS)) {
    const radio = document.getElementById(`prox-${id}`)! as HTMLInputElement;
    if (id === "fly") radio.checked = true;
    radio.addEventListener("change", () => {
      if (radio.checked) CONFIG.FLYING_MPS = speed;
    });
  }
}
setupProxRadioButtons();

function setupRouteByCheckboxes() {
  for (const mode of MODES) {
    const checkbox = document.getElementById(
      `route-by-${mode}`,
    )! as HTMLInputElement;
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        CONFIG.ROUTE_BY.add(mode);
      } else {
        CONFIG.ROUTE_BY.delete(mode);
      }
    });
    if (CONFIG.ROUTE_BY.has(mode)) checkbox.checked = true;
  }
}
setupRouteByCheckboxes();

function distance(from: [number, number] | null, to: [number, number] | null) {
  if (from === null || to === null) {
    return 60 * 5;
  }
  return Math.sqrt(Math.pow(from[0] - to[0], 2) + Math.pow(from[1] - to[1], 2));
}

type LocatedNodes =
  | AirAirport
  | BusStop
  | SeaStop
  | RailStation
  | SpawnWarp
  | Town;
function dijkstra(from: LocatedNodes, to: LocatedNodes): string[] {
  const q: ID[] = [from.i];

  const costs = new Map<ID, number>();
  costs.set(from.i, 0);

  const cameFrom = new Map<ID, { from: ID; text?: () => string }>();
  if (CONFIG.ROUTE_BY.has("spawn-warp"))
    for (const sw of gd.spawnWarps) {
      cameFrom.set(sw.i, {
        from: from.i,
        text: () => `Take spawn warp to ${sw.name}`,
      });
      costs.set(sw.i, CONFIG.CHANGING_COST);
      q.push(sw.i);
    }

  while (q.length !== 0) {
    const node = gd.getNode(
      q.sort((a, b) => costs.get(b)! - costs.get(a)!).pop()!,
    )!;
    const cost = costs.get(node.i)!;

    if (node.i === to.i) {
      const output: string[] = [];
      let fi = node.i;
      while (fi != from.i) {
        let { from: f, text } = cameFrom.get(fi)!;
        console.log(fi, "comes from", f);
        fi = f;
        if (text) output.push(text());
      }
      output.push(`Will take ~${Math.round(cost)} seconds`);
      if (!to.coordinates) output.push("WARNING: End has unknown coordinates");
      if (!from.coordinates)
        output.push("WARNING : Start has unknown coordinates");
      return output.reverse();
    }

    console.log(node, cost, q.length);

    const neighbours: { i: ID; cost: number; text?: () => string }[] = [];

    if (node instanceof LocatedNode) {
      const sql = gd.execGetMany<[ID, number, string]>(
        `WITH P AS (SELECT (CASE WHEN node1 = $1 THEN node2 ELSE node1 END) proxI, distance FROM Proximity WHERE node1 = $1 OR node2 = $1)
             SELECT P.proxI, P.distance, N.type FROM P LEFT JOIN Node N ON P.proxI = N.i`,
        [node.i],
      );
      for (const [proxI, distance, proxType] of sql) {
        neighbours.push({
          i: proxI,
          cost: cost + distance / CONFIG.FLYING_MPS + CONFIG.CHANGING_COST,
          text: () =>
            `Fly ${Math.round(distance)} blocks to ${proxType} ${displayNode(gd.getNode(proxI, proxType)!)}`,
        });
      }
      for (const nodeSF of node.sharedFacilities) {
        neighbours.push({
          i: nodeSF.i,
          cost: cost + CONFIG.CHANGING_COST,
          // @ts-expect-error
          text: `Change to ${nodeSF.constructor.name} ${nodeSF.company.name} ${displayNode(nodeSF)}`,
        });
      }
    }

    if (node instanceof AirAirport) {
      const sql = gd.execGetMany<[ID, string | null]>(
        `SELECT i, code FROM AirGate WHERE airport = $1`,
        [node.i],
      );
      for (const [gateI, gateCode] of sql) {
        neighbours.push({
          i: gateI,
          cost: cost + CONFIG.CHANGING_COST,
          text: gateCode ? () => `Go to gate ${gateCode}` : undefined,
        });
      }
    } else if (node instanceof AirGate) {
      const airport = node.airport;
      neighbours.push({ i: airport.i, cost });

      const sql = gd.execGetMany<[ID, string | null]>(
        `SELECT i, code FROM AirGate WHERE airport = $1 AND i != $2`,
        [airport.i, node.i],
      );
      for (const [gateI, gateCode] of sql) {
        neighbours.push({
          i: gateI,
          cost: cost + CONFIG.CHANGING_COST,
          text: gateCode ? () => `Go to gate ${gateCode}` : undefined,
        });
      }
      if (CONFIG.ROUTE_BY.has("air")) {
        const sql = gd.execGetMany<
          [string, AirMode | null, string, ID, string | null, ID]
        >(
          `SELECT F.code, C.mode, A.name, G.i, G.code, G.airport
               FROM AirFlight F
               LEFT JOIN Aircraft C ON F.aircraft = C.name
               LEFT JOIN AirAirline A ON F.airline = A.i
               LEFT JOIN AirGate G ON F."to" = G.i
               WHERE F."from" = $1`,
          [node.i],
        );
        for (const [
          flightCode,
          aircraftMode,
          airlineName,
          toGateI,
          toGateCode,
          toAirportI,
        ] of sql) {
          if (
            aircraftMode === "traincarts plane" &&
            !CONFIG.ROUTE_BY.has("traincarts")
          )
            continue;
          if (
            aircraftMode !== "traincarts plane" &&
            !CONFIG.ROUTE_BY.has("warp")
          )
            continue;

          const gateCode = node.code;
          const toAirport = new AirAirport(toAirportI, gd);
          neighbours.push({
            i: toGateI,
            cost:
              cost +
              (gateCode === null ? CONFIG.CHANGING_COST : 0) +
              (aircraftMode === "traincarts plane"
                ? distance(airport.coordinates, toAirport.coordinates) /
                  CONFIG.TRAINCART_MPS
                : CONFIG.WARP_COST), // todo flight duration
            text: () =>
              (gateCode !== null ? `At Gate ${gateCode} t` : "T") +
              `ake ${airlineName} ${flightCode} to ${displayNode(toAirport)}` +
              (toGateCode !== null ? ` (Gate ${toGateCode})` : ""),
          });
        }
      }
    } else if (node instanceof BusStop) {
      const sql = gd.execGetMany<[ID, string | null]>(
        `SELECT i, code FROM BusBerth WHERE stop = $1`,
        [node.i],
      );
      for (const [berthI, berthCode] of sql) {
        neighbours.push({
          i: berthI,
          cost: cost + CONFIG.CHANGING_COST,
          text: berthCode ? () => `Go to berth ${berthCode}` : undefined,
        });
      }
    } else if (node instanceof BusBerth) {
      const stop = node.stop;
      neighbours.push({ i: stop.i, cost });

      const sql = gd.execGetMany<[ID, string | null]>(
        `SELECT i, code FROM BusBerth WHERE stop = $1 AND i != $2`,
        [stop.i, node.i],
      );
      for (const [berthI, berthCode] of sql) {
        neighbours.push({
          i: berthI,
          cost: cost + CONFIG.CHANGING_COST,
          text: berthCode ? () => `Go to berth ${berthCode}` : undefined,
        });
      }
      if (CONFIG.ROUTE_BY.has("bus")) {
        const sql = gd.execGetMany<
          [string | null, number | null, ID, ID, string | null, ID, string]
        >(
          `SELECT C.direction, C.duration, B.i, L.i, L.mode, B.stop, CP.name
               FROM BusConnection C
               LEFT JOIN BusLine L ON C.line = L.i
               LEFT JOIN BusBerth B ON C."to" = B.i
               LEFT JOIN BusCompany CP ON L.company = CP.i
               WHERE C."from" = $1`,
          [node.i],
        );
        for (const [
          connDirection,
          connDuration,
          toBerthI,
          lineI,
          lineMode,
          toStopI,
          companyName,
        ] of sql) {
          if (lineMode === "traincarts" && !CONFIG.ROUTE_BY.has("traincarts"))
            continue;
          if (lineMode !== "traincarts" && !CONFIG.ROUTE_BY.has("warp"))
            continue;

          const line = new BusLine(lineI, gd);
          const toStop = new BusStop(toStopI, gd);
          let label = connDirection ?? "";
          if (label) label = `(${label}) `;
          neighbours.push({
            i: toBerthI,
            cost:
              cost +
              (connDuration ??
                (lineMode === "traincarts"
                  ? distance(stop.coordinates, toStop.coordinates) /
                    CONFIG.TRAINCART_MPS
                  : CONFIG.WARP_COST)),
            text: () =>
              `Take ${companyName} ${displayNode(line)} ${label}to ${displayNode(toStop)}`,
          });
        }
      }
    } else if (node instanceof SeaStop) {
      const sql = gd.execGetMany<[ID, string | null]>(
        `SELECT i, code FROM SeaDock WHERE stop = $1`,
        [node.i],
      );
      for (const [dockI, dockCode] of sql) {
        neighbours.push({
          i: dockI,
          cost: cost + CONFIG.CHANGING_COST,
          text: dockCode ? () => `Go to dock ${dockCode}` : undefined,
        });
      }
    } else if (node instanceof SeaDock) {
      const stop = node.stop;
      neighbours.push({ i: stop.i, cost });

      const sql = gd.execGetMany<[ID, string | null]>(
        `SELECT i, code FROM SeaDock WHERE stop = $1 AND i != $2`,
        [stop.i, node.i],
      );
      for (const [dockI, dockCode] of sql) {
        neighbours.push({
          i: dockI,
          cost: cost + CONFIG.CHANGING_COST,
          text: dockCode ? () => `Go to dock ${dockCode}` : undefined,
        });
      }
      if (CONFIG.ROUTE_BY.has("sea")) {
        const sql = gd.execGetMany<
          [string | null, number | null, ID, ID, string | null, ID, string]
        >(
          `SELECT C.direction, C.duration, B.i, L.i, L.mode, B.stop, CP.name
               FROM SeaConnection C
                LEFT JOIN SeaLine L ON C.line = L.i
                LEFT JOIN SeaDock B ON C."to" = B.i
                LEFT JOIN SeaCompany CP ON L.company = CP.i
               WHERE C."from" = $1`,
          [node.i],
        );
        for (const [
          connDirection,
          connDuration,
          toDockI,
          lineI,
          lineMode,
          toStopI,
          companyName,
        ] of sql) {
          if (
            lineMode === "traincarts ferry" &&
            !CONFIG.ROUTE_BY.has("traincarts")
          )
            continue;
          if (lineMode !== "traincarts ferry" && !CONFIG.ROUTE_BY.has("warp"))
            continue;

          const line = new SeaLine(lineI, gd);
          const toStop = new SeaStop(toStopI, gd);
          let label = connDirection ?? "";
          if (label) label = `(${label}) `;
          neighbours.push({
            i: toDockI,
            cost:
              cost +
              (connDuration ??
                (lineMode === "traincarts ferry"
                  ? distance(stop.coordinates, toStop.coordinates) /
                    CONFIG.TRAINCART_MPS
                  : CONFIG.WARP_COST)),
            text: () =>
              `Take ${companyName} ${displayNode(line)} ${label}to ${displayNode(toStop)}`,
          });
        }
      }
    } else if (node instanceof RailStation) {
      const sql = gd.execGetMany<[ID, string | null]>(
        `SELECT i, code FROM RailPlatform WHERE station = $1`,
        [node.i],
      );
      for (const [platformI, platformCode] of sql) {
        neighbours.push({
          i: platformI,
          cost: cost + CONFIG.CHANGING_COST,
          text: platformCode
            ? () => `Go to platform ${platformCode}`
            : undefined,
        });
      }
    } else if (node instanceof RailPlatform) {
      const station = node.station;
      neighbours.push({ i: station.i, cost });

      const sql = gd.execGetMany<[ID, string | null]>(
        `SELECT i, code FROM RailPlatform WHERE station = $1 AND i != $2`,
        [station.i, node.i],
      );
      for (const [platformI, platformCode] of sql) {
        neighbours.push({
          i: platformI,
          cost: cost + CONFIG.CHANGING_COST,
          text: platformCode
            ? () => `Go to platform ${platformCode}`
            : undefined,
        });
      }
      if (CONFIG.ROUTE_BY.has("rail")) {
        const sql = gd.execGetMany<
          [
            string | null,
            number | null,
            ID,
            ID,
            string | null,
            number | null,
            ID,
            string,
          ]
        >(
          `SELECT C.direction, C.duration, B.i, L.i, L.mode, L.local, B.station, CP.name
               FROM RailConnection C
                LEFT JOIN RailLine L ON C.line = L.i
                LEFT JOIN RailPlatform B ON C."to" = B.i
                LEFT JOIN RailCompany CP ON L.company = CP.i
               WHERE C."from" = $1`,
          [node.i],
        );
        for (const [
          connDirection,
          connDuration,
          toPlatformI,
          lineI,
          lineMode,
          lineLocal,
          toStationI,
          companyName,
        ] of sql) {
          if (lineMode === "traincarts" && !CONFIG.ROUTE_BY.has("traincarts"))
            continue;
          if (lineMode === "warp" && !CONFIG.ROUTE_BY.has("warp")) continue;
          if (lineMode === "vehicles" && !CONFIG.ROUTE_BY.has("vehicles"))
            continue;
          if (lineMode === "cart" && !CONFIG.ROUTE_BY.has("cart")) continue;

          const line = new RailLine(lineI, gd);
          const toStation = new RailStation(toStationI, gd);
          let label = connDirection ?? "";
          if (label) label = `(${label}) `;
          neighbours.push({
            i: toPlatformI,
            cost:
              cost +
              (connDuration ??
                (lineMode === "traincarts" || lineMode == "vehicles"
                  ? distance(station.coordinates, toStation.coordinates) /
                    (lineLocal
                      ? CONFIG.TRAINCART_LOCAL_MPS
                      : CONFIG.TRAINCART_MPS)
                  : lineMode === "cart"
                    ? distance(station.coordinates, toStation.coordinates) /
                      CONFIG.CART_MPS
                    : CONFIG.WARP_COST)),
            text: () =>
              `Take ${companyName} ${displayNode(line)} ${label}to ${displayNode(toStation)}`,
          });
        }
      }
    }

    for (const { i: neighbour, cost: newCost, text } of neighbours) {
      const existingCost = costs.get(neighbour) ?? Infinity;
      if (!costs.has(neighbour)) q.push(neighbour);
      if (newCost < existingCost) {
        cameFrom.set(neighbour, { from: node.i, text });
        costs.set(neighbour, newCost);
      }
    }
  }

  return ["No route"];
}

htmlGo.addEventListener("click", () => {
  htmlOut.innerHTML = "";
  const from = gd.getNode(parseInt(htmlFrom.value))! as LocatedNodes;
  const to = gd.getNode(parseInt(htmlTo.value))! as LocatedNodes;
  if (from.i === to.i) {
    htmlOut.innerHTML = "Already there";
    return;
  }

  htmlOut.innerHTML += dijkstra(from, to)
    .map((a) =>
      a
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;"),
    )
    .join("<br>");
});
