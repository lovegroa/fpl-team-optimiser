/* eslint-disable @typescript-eslint/no-unused-vars */
import {Pool} from 'pg';
import {
  calculatedPredictedPoints,
  calculateMultipliers,
  createPlayerFixtures,
  findBestTeam,
  updateFixtures,
  updateGameweeks,
  updatePlayers,
  updatePlayersExpectedToPlay,
  updateProbabilities,
  updateTable,
} from './functions';
import {CurrentTable} from './types';

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'fpl',
  password: 'Terr0r58!',
  port: 5432,
});

const currentTable: CurrentTable = [
  [1, 'Arsenal'],
  [13, 'Man City'],
  [15, 'Newcastle'],
  [14, 'Man Utd'],
  [18, 'Spurs'],
  [9, 'Fulham'],
  [12, 'Liverpool'],
  [5, 'Brighton'],
  [4, 'Brentford'],
  [6, 'Chelsea'],
  [2, 'Aston Villa'],
  [7, 'Crystal Palace'],
  [10, 'Leicester'],
  [11, 'Leeds'],
  [16, "Nott'm Forest"],
  [3, 'Bournemouth'],
  [19, 'West Ham'],
  [8, 'Everton'],
  [20, 'Wolves'],
  [17, 'Southampton'],
];

// updateTable(pool, currentTable);

// updateFixtures(pool);

// updatePlayers(pool);

// createPlayerFixtures(pool);

// updateProbabilities(pool);

// updateGameweeks(pool, 19);

// calculateMultipliers(pool);

// calculatedPredictedPoints(pool, 1);

// updatePlayersExpectedToPlay(pool);

// findBestTeam(
//   [15, 16], //gameweeks
//   pool,
//   [
//     81, //      Raya
//     306, //     Cancelo
//     357, //     Tripier
//     475, //     Coady
//     13, //      Saka
//     160, //     Zaha
//     301, //     De Bruyne
//     335, //     Rashford
//     369, //     Almiron
//     318, //     Haaland
//     66, //      Solanke
//   ], //playersToInclude
//   [
//     397, //     Awoniyi
//     295, //     N.Williams
//     529, //     Scamacca
//   ] //playersToIgnore
// );
// findBestTeam(
//   [20], //gameweeks
//   pool,
//   [], //playersToInclude
//   [240, 388, 474, 258, 257, 526, 417, 516, 92, 538, 484, 612, 623, 573, 446] //playersToIgnore
// );
findBestTeam(
  [21, 22, 23, 24, 25, 26, 27, 28, 29, 30], //gameweeks
  pool,
  [], //playersToInclude
  [] //playersToIgnore
);
