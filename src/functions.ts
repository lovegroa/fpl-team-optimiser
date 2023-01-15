/* eslint-disable node/no-unsupported-features/node-builtins */
import {Pool} from 'pg';
import {BootstrapStatic, CurrentTable, Fixtures} from './types';
import format from 'pg-format';
import axios from 'axios';
import {parse} from 'node-html-parser';
import fs from 'fs';

export const getFile = (filePath: string) => {
  try {
    const rawdata = fs.readFileSync(filePath, 'utf8');
    return rawdata;
  } catch (error) {
    return error;
  }
};

export const updateTable = (pool: Pool, currentTable: CurrentTable) => {
  const values = currentTable.map(([id, name], index) => [id, name, index + 1]);
  pool.query(
    format(
      'INSERT INTO teams (id, "name", "position") VALUES %L ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, position = EXCLUDED.position',
      values
    ),
    (error, results) => {
      if (error) {
        console.log(error.message);
      } else {
        console.log(results.command, results.rowCount);
      }
    }
  );
};

export const updateFixtures = async (pool: Pool) => {
  const request = await axios.get(
    'https://fantasy.premierleague.com/api/fixtures/'
  );

  const fixtures = request.data as Fixtures;

  const values = fixtures.map(
    ({
      id,
      code,
      event,
      finished,
      finished_provisional,
      kickoff_time,
      minutes,
      provisional_start_time,
      started,
      team_a,
      team_a_score,
      team_h,
      team_h_score,
      team_h_difficulty,
      team_a_difficulty,
      pulse_id,
    }) => [
      id,
      code,
      event,
      finished,
      finished_provisional,
      kickoff_time,
      minutes,
      provisional_start_time ? provisional_start_time : null,
      started,
      team_a,
      team_a_score,
      team_h,
      team_h_score,
      team_h_difficulty,
      team_a_difficulty,
      pulse_id,
    ]
  );

  pool.query(
    format(
      `
      INSERT INTO fixtures (
        id, "code", "event", 
        "finished", "finished_provisional", "kickoff_time", 
        "minutes", "provisional_start_time", "started", 
        "team_a", "team_a_score", "team_h", 
        "team_h_score", "team_h_difficulty", "team_a_difficulty",
        "pulse_id"
        ) 
        VALUES %L ON CONFLICT (id) DO UPDATE SET 
        code = EXCLUDED.code, event = EXCLUDED.event, 
        finished = EXCLUDED.finished, finished_provisional = EXCLUDED.finished_provisional, kickoff_time = EXCLUDED.kickoff_time, 
        minutes = EXCLUDED.minutes, provisional_start_time = EXCLUDED.provisional_start_time, started = EXCLUDED.started,
        team_a = EXCLUDED.team_a, team_a_score = EXCLUDED.team_a_score, team_h = EXCLUDED.team_h,
        team_h_score = EXCLUDED.team_h_score, team_h_difficulty = EXCLUDED.team_h_difficulty, team_a_difficulty = EXCLUDED.team_a_difficulty,
        pulse_id = EXCLUDED.pulse_id
    `,
      values
    ),
    (error, results) => {
      if (error) {
        console.log(error.message);
      } else {
        console.log(results.command, results.rowCount);
      }
    }
  );
};

export const updateProbabilities = async (pool: Pool) => {
  type DatabaseFixturesEnriched = [number, number, number, number][];

  type DatabaseFixture = {
    id: number;
    code: number;
    event: number;
    finished: boolean;
    finished_provisional: boolean;
    kickoff_time: Date;
    minutes: number;
    provisional_start_time?: Date;
    started: boolean;
    team_a: number;
    team_a_score?: number;
    team_h: number;
    team_h_score?: number;
    team_h_difficulty: number;
    team_a_difficulty: number;
    pulse_id: number;
  };

  const teamLookup = {
    Arsenal: 1,
    AstonVilla: 2,
    Bournemouth: 3,
    Brentford: 4,
    Brighton: 5,
    Chelsea: 6,
    CrystalPalace: 7,
    Everton: 8,
    Fulham: 9,
    Leicester: 10,
    LeedsUnited: 11,
    Liverpool: 12,
    ManCity: 13,
    ManUnited: 14,
    Newcastle: 15,
    NottmForest: 16,
    Southampton: 17,
    Tottenham: 18,
    WestHam: 19,
    Wolves: 20,
  };

  const data = getFile('assets/team-results.html') as string;
  const root = parse(data);
  const fixtures = root.querySelectorAll('.match-container');

  const result = fixtures.map(fixture => {
    const home = fixture.querySelector('.match-top');
    const hTeam = home
      ?.querySelector('.name')
      ?.innerText.replace(/\W/g, '') as keyof typeof teamLookup;
    const hTeamWin = Number(
      home?.querySelector('.prob')?.innerText.replace(/\D/g, '')
    );
    const away = fixture.querySelector('.match-bottom');
    const aTeam = away
      ?.querySelector('.name')
      ?.innerText.replace(/\W/g, '') as keyof typeof teamLookup;
    const aTeamWin = Number(
      away?.querySelector('.prob')?.innerText.replace(/\D/g, '')
    );

    const aTeamID = teamLookup[aTeam];
    const hTeamID = teamLookup[hTeam];

    return {
      hTeamID,
      hTeam,
      hTeamWin,
      aTeamID,
      aTeam,
      aTeamWin,
      draw: 100 - hTeamWin - aTeamWin,
    };
  });

  const postQueryF = (databaseFixtures: DatabaseFixture[]) => {
    const databaseFixturesEnriched: DatabaseFixturesEnriched = [];

    databaseFixtures.forEach(({id, team_a, team_h}) => {
      const fixture = result.filter(
        f => f.aTeamID === team_a && f.hTeamID === team_h
      )[0];

      if (fixture) {
        databaseFixturesEnriched.push([
          id,
          fixture.hTeamWin,
          fixture.aTeamWin,
          fixture.draw,
        ]);
      }
    });

    const q = databaseFixturesEnriched
      .map(
        ([id, hTeamWin, aTeamWin, draw]) =>
          `UPDATE "fixtures" SET "team_h_win" = ${hTeamWin}, "team_a_win" = ${aTeamWin}, "draw" = ${draw} WHERE id = ${id};`
      )
      .join('');

    pool.query(q, (error, results) => {
      if (error) {
        console.log(error.message);
      } else {
        // console.log(results);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const a = results as any;
        console.log('UPDATE', a.length);
      }
    });
  };

  pool.query('SELECT * FROM fixtures', (error, results) => {
    if (error) {
      console.log(error.message);
    } else {
      console.log(results.command, results.rowCount);
      postQueryF(results.rows);
    }
  });
};

export const updatePlayers = async (pool: Pool) => {
  const request = await axios.get(
    'https://fantasy.premierleague.com/api/bootstrap-static/'
  );

  const bootstrapStatic = request.data as BootstrapStatic;

  const elements = bootstrapStatic.elements.map(element => [
    element.chance_of_playing_next_round,
    element.chance_of_playing_this_round,
    element.code,
    element.cost_change_event,
    element.cost_change_event_fall,
    element.cost_change_start,
    element.cost_change_start_fall,
    element.dreamteam_count,
    element.element_type,
    element.ep_next,
    element.ep_this,
    element.event_points,
    element.first_name,
    element.form,
    element.id,
    element.in_dreamteam,
    element.news,
    element.news_added,
    element.now_cost,
    element.photo,
    element.points_per_game,
    element.second_name,
    element.selected_by_percent,
    element.special,
    element.squad_number,
    element.status,
    element.team,
    element.team_code,
    element.total_points,
    element.transfers_in,
    element.transfers_in_event,
    element.transfers_out,
    element.transfers_out_event,
    element.value_form,
    element.value_season,
    element.web_name,
    element.minutes,
    element.goals_scored,
    element.assists,
    element.clean_sheets,
    element.goals_conceded,
    element.own_goals,
    element.penalties_saved,
    element.penalties_missed,
    element.yellow_cards,
    element.red_cards,
    element.saves,
    element.bonus,
    element.bps,
    element.influence,
    element.creativity,
    element.threat,
    element.ict_index,
    element.influence_rank,
    element.influence_rank_type,
    element.creativity_rank,
    element.creativity_rank_type,
    element.threat_rank,
    element.threat_rank_type,
    element.ict_index_rank,
    element.ict_index_rank_type,
    element.corners_and_indirect_freekicks_order,
    element.corners_and_indirect_freekicks_text,
    element.direct_freekicks_order,
    element.direct_freekicks_text,
    element.penalties_order,
    element.penalties_text,
  ]);

  pool.query(
    format(
      `
        INSERT INTO players (
            "chance_of_playing_next_round",
            "chance_of_playing_this_round",
            "code",
            "cost_change_event",
            "cost_change_event_fall",
            "cost_change_start",
            "cost_change_start_fall",
            "dreamteam_count",
            "element_type",
            "ep_next",
            "ep_this",
            "event_points",
            "first_name",
            "form",
            "id",
            "in_dreamteam",
            "news",
            "news_added",
            "now_cost",
            "photo",
            "points_per_game",
            "second_name",
            "selected_by_percent",
            "special",
            "squad_number",
            "status",
            "team",
            "team_code",
            "total_points",
            "transfers_in",
            "transfers_in_event",
            "transfers_out",
            "transfers_out_event",
            "value_form",
            "value_season",
            "web_name",
            "minutes",
            "goals_scored",
            "assists",
            "clean_sheets",
            "goals_conceded",
            "own_goals",
            "penalties_saved",
            "penalties_missed",
            "yellow_cards",
            "red_cards",
            "saves",
            "bonus",
            "bps",
            "influence",
            "creativity",
            "threat",
            "ict_index",
            "influence_rank",
            "influence_rank_type",
            "creativity_rank",
            "creativity_rank_type",
            "threat_rank",
            "threat_rank_type",
            "ict_index_rank",
            "ict_index_rank_type",
            "corners_and_indirect_freekicks_order",
            "corners_and_indirect_freekicks_text",
            "direct_freekicks_order",
            "direct_freekicks_text",
            "penalties_order",
            "penalties_text"
          ) 
          VALUES %L ON CONFLICT (id) DO UPDATE SET

          chance_of_playing_next_round = EXCLUDED.chance_of_playing_next_round,
          chance_of_playing_this_round = EXCLUDED.chance_of_playing_this_round,
          code = EXCLUDED.code,
          cost_change_event = EXCLUDED.cost_change_event,
          cost_change_event_fall = EXCLUDED.cost_change_event_fall,
          cost_change_start = EXCLUDED.cost_change_start,
          cost_change_start_fall = EXCLUDED.cost_change_start_fall,
          dreamteam_count = EXCLUDED.dreamteam_count,
          element_type = EXCLUDED.element_type,
          ep_next = EXCLUDED.ep_next,
          ep_this = EXCLUDED.ep_this,
          event_points = EXCLUDED.event_points,
          first_name = EXCLUDED.first_name,
          form = EXCLUDED.form,
          id = EXCLUDED.id,
          in_dreamteam = EXCLUDED.in_dreamteam,
          news = EXCLUDED.news,
          news_added = EXCLUDED.news_added,
          now_cost = EXCLUDED.now_cost,
          photo = EXCLUDED.photo,
          points_per_game = EXCLUDED.points_per_game,
          second_name = EXCLUDED.second_name,
          selected_by_percent = EXCLUDED.selected_by_percent,
          special = EXCLUDED.special,
          squad_number = EXCLUDED.squad_number,
          status = EXCLUDED.status,
          team = EXCLUDED.team,
          team_code = EXCLUDED.team_code,
          total_points = EXCLUDED.total_points,
          transfers_in = EXCLUDED.transfers_in,
          transfers_in_event = EXCLUDED.transfers_in_event,
          transfers_out = EXCLUDED.transfers_out,
          transfers_out_event = EXCLUDED.transfers_out_event,
          value_form = EXCLUDED.value_form,
          value_season = EXCLUDED.value_season,
          web_name = EXCLUDED.web_name,
          minutes = EXCLUDED.minutes,
          goals_scored = EXCLUDED.goals_scored,
          assists = EXCLUDED.assists,
          clean_sheets = EXCLUDED.clean_sheets,
          goals_conceded = EXCLUDED.goals_conceded,
          own_goals = EXCLUDED.own_goals,
          penalties_saved = EXCLUDED.penalties_saved,
          penalties_missed = EXCLUDED.penalties_missed,
          yellow_cards = EXCLUDED.yellow_cards,
          red_cards = EXCLUDED.red_cards,
          saves = EXCLUDED.saves,
          bonus = EXCLUDED.bonus,
          bps = EXCLUDED.bps,
          influence = EXCLUDED.influence,
          creativity = EXCLUDED.creativity,
          threat = EXCLUDED.threat,
          ict_index = EXCLUDED.ict_index,
          influence_rank = EXCLUDED.influence_rank,
          influence_rank_type = EXCLUDED.influence_rank_type,
          creativity_rank = EXCLUDED.creativity_rank,
          creativity_rank_type = EXCLUDED.creativity_rank_type,
          threat_rank = EXCLUDED.threat_rank,
          threat_rank_type = EXCLUDED.threat_rank_type,
          ict_index_rank = EXCLUDED.ict_index_rank,
          ict_index_rank_type = EXCLUDED.ict_index_rank_type,
          corners_and_indirect_freekicks_order = EXCLUDED.corners_and_indirect_freekicks_order,
          corners_and_indirect_freekicks_text = EXCLUDED.corners_and_indirect_freekicks_text,
          direct_freekicks_order = EXCLUDED.direct_freekicks_order,
          direct_freekicks_text = EXCLUDED.direct_freekicks_text,
          penalties_order = EXCLUDED.penalties_order,
          penalties_text = EXCLUDED.penalties_text
      `,
      elements
    ),
    (error, results) => {
      if (error) {
        console.log(error.message);
      } else {
        console.log(results.command, results.rowCount);
      }
    }
  );
};

export const updateGameweeks = async (
  pool: Pool,
  currentGameweekNo: number
) => {
  interface Gameweek {
    elements: {
      id: number;
      stats: {
        minutes: number;
        goals_scored: number;
        assists: number;
        clean_sheets: number;
        goals_conceded: number;
        own_goals: number;
        penalties_saved: number;
        penalties_missed: number;
        yellow_cards: number;
        red_cards: number;
        saves: number;
        bonus: number;
        bps: number;
        influence: string;
        creativity: string;
        threat: string;
        ict_index: string;
        total_points: number;
        in_dreamteam: boolean;
      };
      explain: {
        fixture: number;
        stats: {
          identifier: string;
          points: number;
          value: number;
        }[];
      }[];
    }[];
  }

  for (let gameweekNo = 1; gameweekNo <= currentGameweekNo; gameweekNo++) {
    const data = await axios.get(
      `https://fantasy.premierleague.com/api/event/${gameweekNo}/live/`
    );

    const statTypes = [
      'minutes',
      'goals_scored',
      'assists',
      'clean_sheets',
      'goals_conceded',
      'own_goals',
      'penalties_saved',
      'penalties_missed',
      'yellow_cards',
      'red_cards',
      'saves',
      'bonus',
      'bps',
    ];

    const gameweek = data.data as Gameweek;

    const values: number[][] = [];

    gameweek.elements.forEach(element => {
      element.explain.forEach(fixture => {
        let fixturePoints = 0;
        const stats: number[] = [];
        statTypes.forEach(statType => {
          const item = fixture.stats.filter(
            stat => stat.identifier === statType
          );
          const value = item.reduce((acc, i) => (acc += i.value), 0);
          const points = item.reduce((acc, i) => (acc += i.points), 0);
          stats.push(value);
          fixturePoints += points;
        });
        values.push([element.id, fixture.fixture, ...stats, fixturePoints]);
      });
    });
    // CREATE UNIQUE INDEX tempIndex ON players_fixtures (player_id, fixture_id);

    pool.query(
      format(
        `
        INSERT INTO players_fixtures (
            player_id,
            fixture_id,
            minutes,
            goals_scored,
            assists, 
            clean_sheets,
            goals_conceded,
            own_goals, 
            penalties_saved,
            penalties_missed,
            yellow_cards,
            red_cards,
            saves,
            bonus,
            bps,
            points
        ) 
        VALUES %L ON CONFLICT (player_id, fixture_id) DO UPDATE SET 
        minutes = EXCLUDED.minutes,
        goals_scored = EXCLUDED.goals_scored,
        assists = EXCLUDED.assists,
        clean_sheets = EXCLUDED.clean_sheets,
        goals_conceded = EXCLUDED.goals_conceded,
        own_goals = EXCLUDED.own_goals,
        penalties_saved = EXCLUDED.penalties_saved,
        penalties_missed = EXCLUDED.penalties_missed,
        yellow_cards = EXCLUDED.yellow_cards,
        red_cards = EXCLUDED.red_cards,
        saves = EXCLUDED.saves,
        bonus = EXCLUDED.bonus,
        bps = EXCLUDED.bps,
        points = EXCLUDED.points
        `,
        values
      ),
      (error, results) => {
        if (error) {
          console.log(gameweekNo, error.message);
        } else {
          console.log(gameweekNo, results.command, results.rowCount);
        }
      }
    );
  }
};

export const calculateMultipliers = (pool: Pool) => {
  type SQLResponse = {
    player_id: number;
    fixture_id: number;
    minutes: number;
    points: number;
    players_team: number;
    fixtures_team_a: number;
    fixtures_team_a_score: number;
    fixtures_team_h: number;
    fixtures_team_h_score: number;
    teams_team_a_position: number;
    teams_team_h_position: number;
  };

  pool.query(
    `
    SELECT
        player_id,
        fixture_id, 
        players_fixtures.minutes,
        points,
        players.team AS players_team,
        fixtures.team_a AS fixtures_team_a,
        fixtures.team_a_score AS fixtures_team_a_score,
        fixtures.team_h AS fixtures_team_h,
        fixtures.team_h_score AS fixtures_team_h_score,
        a_team.position AS teams_team_a_position,
        h_team.position AS teams_team_h_position
    FROM players_fixtures 
    LEFT JOIN players ON players.id = players_fixtures.player_id 
    LEFT JOIN fixtures ON fixtures.id = players_fixtures.fixture_id
    LEFT JOIN teams AS a_team ON a_team.id = fixtures.team_a
    LEFT JOIN teams AS h_team ON h_team.id = fixtures.team_h;
  `,
    (error, results) => {
      if (error) {
        console.log(error.message);
      } else {
        const response = results.rows as SQLResponse[];

        const playerIDs = new Set(response.map(item => item.player_id));

        const result: number[][] = [];

        playerIDs.forEach(playerID => {
          const playerFixtures = response.filter(
            item => item.player_id === playerID && item.minutes > 0
          );

          const getPointTotal = (playerFixtures: SQLResponse[]) => {
            return playerFixtures.reduce((acc, {points}) => (acc += points), 0);
          };

          const totalPoints = getPointTotal(playerFixtures);
          const totalGamesPlayed = playerFixtures.length;
          const PPG = totalPoints / totalGamesPlayed;

          //when won

          type Categories = {
            winsPlayerFixtures: SQLResponse[];
            drawsPlayerFixtures: SQLResponse[];
            lossesPlayerFixtures: SQLResponse[];
            firstQuartilePlayerFixtures: SQLResponse[];
            secondQuartilePlayerFixtures: SQLResponse[];
            thirdQuartilePlayerFixtures: SQLResponse[];
            fourthQuartilePlayerFixtures: SQLResponse[];
            homePlayerFixtures: SQLResponse[];
            awayPlayerFixtures: SQLResponse[];
          };

          const categories: Categories = {
            winsPlayerFixtures: [],
            drawsPlayerFixtures: [],
            lossesPlayerFixtures: [],
            firstQuartilePlayerFixtures: [],
            secondQuartilePlayerFixtures: [],
            thirdQuartilePlayerFixtures: [],
            fourthQuartilePlayerFixtures: [],
            homePlayerFixtures: [],
            awayPlayerFixtures: [],
          };
          playerFixtures.forEach(playerFixture => {
            const {
              players_team,
              fixtures_team_h,
              fixtures_team_h_score,
              fixtures_team_a_score,
              teams_team_h_position,
              teams_team_a_position,
            } = playerFixture;

            const {
              winsPlayerFixtures,
              drawsPlayerFixtures,
              lossesPlayerFixtures,
              firstQuartilePlayerFixtures,
              secondQuartilePlayerFixtures,
              thirdQuartilePlayerFixtures,
              fourthQuartilePlayerFixtures,
              homePlayerFixtures,
              awayPlayerFixtures,
            } = categories;

            if (players_team === fixtures_team_h) {
              homePlayerFixtures.push(playerFixture);

              if (fixtures_team_h_score > fixtures_team_a_score) {
                winsPlayerFixtures.push(playerFixture);
              } else if (fixtures_team_h_score < fixtures_team_a_score) {
                lossesPlayerFixtures.push(playerFixture);
              } else {
                drawsPlayerFixtures.push(playerFixture);
              }

              switch (Math.ceil(teams_team_a_position / 5) as 1 | 2 | 3 | 4) {
                case 1:
                  firstQuartilePlayerFixtures.push(playerFixture);
                  break;
                case 2:
                  secondQuartilePlayerFixtures.push(playerFixture);
                  break;
                case 3:
                  thirdQuartilePlayerFixtures.push(playerFixture);
                  break;
                case 4:
                  fourthQuartilePlayerFixtures.push(playerFixture);
                  break;
                default:
                  break;
              }
            } else {
              awayPlayerFixtures.push(playerFixture);

              if (fixtures_team_h_score < fixtures_team_a_score) {
                winsPlayerFixtures.push(playerFixture);
              } else if (fixtures_team_h_score > fixtures_team_a_score) {
                lossesPlayerFixtures.push(playerFixture);
              } else {
                drawsPlayerFixtures.push(playerFixture);
              }

              switch (Math.ceil(teams_team_h_position / 5) as 1 | 2 | 3 | 4) {
                case 1:
                  firstQuartilePlayerFixtures.push(playerFixture);
                  break;
                case 2:
                  secondQuartilePlayerFixtures.push(playerFixture);
                  break;
                case 3:
                  thirdQuartilePlayerFixtures.push(playerFixture);
                  break;
                case 4:
                  fourthQuartilePlayerFixtures.push(playerFixture);
                  break;
                default:
                  break;
              }
            }
          });

          const multipliers = Object.values(categories).map(pf => {
            return pf.length
              ? Math.round(
                  (getPointTotal(pf) / pf.length / (PPG !== 0 ? PPG : 1)) * 100
                ) / 100
              : 1;
          });

          multipliers.push(playerID);

          result.push(multipliers);
        });

        pool.query(
          format(
            `
              INSERT INTO players (
                  multiplier_win,
                  multiplier_draw,
                  multiplier_loss,
                  multiplier_q1,
                  multiplier_q2, 
                  multiplier_q3,
                  multiplier_q4,
                  multiplier_home, 
                  multiplier_away,
                  id
              ) 
              VALUES %L ON CONFLICT (id) DO UPDATE SET 
                multiplier_win = EXCLUDED.multiplier_win,
                multiplier_draw = EXCLUDED.multiplier_draw,
                multiplier_loss = EXCLUDED.multiplier_loss,
                multiplier_q1 = EXCLUDED.multiplier_q1,
                multiplier_q2 = EXCLUDED.multiplier_q2, 
                multiplier_q3 = EXCLUDED.multiplier_q3,
                multiplier_q4 = EXCLUDED.multiplier_q4,
                multiplier_home = EXCLUDED.multiplier_home, 
                multiplier_away = EXCLUDED.multiplier_away
              `,
            result
          ),
          (error, results) => {
            if (error) {
              console.log(error.message);
            } else {
              console.log(results.command, results.rowCount);
            }
          }
        );
      }
    }
  );
};

export const calculatedPredictedPoints = (pool: Pool, factor: number) => {
  type SQLResponse = {
    id: number;
    points_per_game: number;
    multiplier_home: number;
    multiplier_away: number;
    multiplier_win: number;
    multiplier_draw: number;
    multiplier_loss: number;
    multiplier_q1: number;
    multiplier_q2: number;
    multiplier_q3: number;
    multiplier_q4: number;
    players_team: number;
    fixtures_team_a: number;
    fixtures_team_h: number;
    fixtures_team_h_win: number;
    fixtures_team_a_win: number;
    fixtures_draw: number;
    teams_team_a_position: number;
    teams_team_h_position: number;
  };

  pool.query(
    `
    SELECT
    players_fixtures.id as id,
    points_per_game,
    multiplier_home,
    multiplier_away,
    multiplier_win,
    multiplier_draw,
    multiplier_loss,
    multiplier_q1,
    multiplier_q2,
    multiplier_q3,
    multiplier_q4,
    players.team AS players_team,
    fixtures.team_h AS fixtures_team_h,
    fixtures.team_a AS fixtures_team_a,
    fixtures.team_h_win AS fixtures_team_h_win,
    fixtures.team_a_win AS fixtures_team_a_win,
    fixtures.draw AS fixtures_draw,
    h_team.position AS teams_team_h_position,
    a_team.position AS teams_team_a_position
    

FROM players_fixtures 
LEFT JOIN players ON players.id = players_fixtures.player_id 
LEFT JOIN fixtures ON fixtures.id = players_fixtures.fixture_id
LEFT JOIN teams AS a_team ON a_team.id = fixtures.team_a
LEFT JOIN teams AS h_team ON h_team.id = fixtures.team_h;


      `,
    (error, results) => {
      if (error) {
        console.log(error.message);
      } else {
        console.log(results.command, results.rowCount);
        const playersFixtures = results.rows as SQLResponse[];

        const multiplierFactor = (
          type: 'ha' | 'wdl' | 'q' | 'ppg',
          multiplier: number
        ) => {
          const factors = {
            ha: 1.37938236159406,
            wdl: 0.158896575040828,
            q: 2.42528882631798,
            ppg: 0.980018375284149,
          };

          return 1;
          //   return multiplier * factors[type];
        };

        const values = playersFixtures.map(
          ({
            id,
            points_per_game,
            multiplier_home,
            multiplier_away,
            multiplier_win,
            multiplier_draw,
            multiplier_loss,
            multiplier_q1,
            multiplier_q2,
            multiplier_q3,
            multiplier_q4,
            players_team,
            fixtures_team_h,
            fixtures_team_h_win,
            fixtures_team_a_win,
            fixtures_draw,
            teams_team_a_position,
            teams_team_h_position,
          }) => {
            let predictedPoints: number =
              points_per_game * multiplierFactor('ppg', 1);

            if (fixtures_team_h === players_team) {
              predictedPoints =
                predictedPoints * multiplierFactor('ha', multiplier_home);

              const probablitiesMultiplier =
                (fixtures_team_h_win / 100) *
                  multiplierFactor('wdl', multiplier_win) +
                (fixtures_team_a_win / 100) *
                  multiplierFactor('wdl', multiplier_loss) +
                (fixtures_draw / 100) *
                  multiplierFactor('wdl', multiplier_draw);

              predictedPoints = predictedPoints * probablitiesMultiplier;

              switch (Math.ceil(teams_team_a_position / 5) as 1 | 2 | 3 | 4) {
                case 1:
                  predictedPoints =
                    predictedPoints * multiplierFactor('q', multiplier_q1);
                  break;
                case 2:
                  predictedPoints =
                    predictedPoints * multiplierFactor('q', multiplier_q2);
                  break;
                case 3:
                  predictedPoints =
                    predictedPoints * multiplierFactor('q', multiplier_q3);
                  break;
                case 4:
                  predictedPoints =
                    predictedPoints * multiplierFactor('q', multiplier_q4);
                  break;
                default:
                  break;
              }
            } else {
              predictedPoints =
                predictedPoints * multiplierFactor('ha', multiplier_away);

              const probablitiesMultiplier =
                (fixtures_team_h_win / 100) *
                  multiplierFactor('wdl', multiplier_loss) +
                (fixtures_team_a_win / 100) *
                  multiplierFactor('wdl', multiplier_win) +
                (fixtures_draw / 100) *
                  multiplierFactor('wdl', multiplier_draw);

              predictedPoints = predictedPoints * probablitiesMultiplier;

              switch (Math.ceil(teams_team_h_position / 5) as 1 | 2 | 3 | 4) {
                case 1:
                  predictedPoints =
                    predictedPoints * multiplierFactor('q', multiplier_q1);
                  break;
                case 2:
                  predictedPoints =
                    predictedPoints * multiplierFactor('q', multiplier_q2);
                  break;
                case 3:
                  predictedPoints =
                    predictedPoints * multiplierFactor('q', multiplier_q3);
                  break;
                case 4:
                  predictedPoints =
                    predictedPoints * multiplierFactor('q', multiplier_q4);
                  break;
                default:
                  break;
              }
            }

            return [id, Math.round(predictedPoints * 100) / 100];
          }
        );

        pool.query(
          format(
            `
                INSERT INTO players_fixtures (
                    id,
                    predicted_points
                ) 
                VALUES %L ON CONFLICT (id) DO UPDATE SET 
                predicted_points = EXCLUDED.predicted_points;
                `,
            values
          ),
          (error, results) => {
            if (error) {
              console.log(error.message);
            } else {
              console.log(results.command, results.rowCount);
            }
          }
        );
      }
    }
  );
};

export const createPlayerFixtures = async (pool: Pool) => {
  const request1 = await axios.get(
    'https://fantasy.premierleague.com/api/bootstrap-static/'
  );

  const bootstrapStatic = request1.data as BootstrapStatic;

  const request2 = await axios.get(
    'https://fantasy.premierleague.com/api/fixtures/'
  );

  const fixtures = request2.data as Fixtures;

  const values: number[][] = [];

  bootstrapStatic.elements.forEach(player => {
    const valuesTmp = fixtures
      .filter(
        fixture =>
          fixture.team_a === player.team || fixture.team_h === player.team
      )
      .map(fixture => [player.id, fixture.id]);

    values.push(...valuesTmp);
  });

  pool.query(
    format(
      `
      INSERT INTO players_fixtures (
          player_id,
          fixture_id
      ) 
      VALUES %L ON CONFLICT (player_id, fixture_id) DO UPDATE SET 
      player_id = EXCLUDED.player_id,
      fixture_id = EXCLUDED.fixture_id
      `,
      values
    ),
    (error, results) => {
      if (error) {
        console.log(error.message);
      } else {
        console.log(results.command, results.rowCount);
      }
    }
  );
};

export const updatePlayersExpectedToPlay = async (pool: Pool) => {
  type PlayerToPlay = {
    team: number;
    name: string;
    id: number;
  };

  const playerMap = [
    {team: 1, name: 'Odegaard', id: 7},
    {team: 1, name: 'White (Ben)', id: 10},
    {team: 1, name: 'Eddie Nketiah', id: 11},
    {team: 1, name: 'Gabriel Magalhães', id: 16},
    {team: 1, name: 'Sambi Lokonga', id: 18},
    {team: 1, name: 'Gabriel Martinelli', id: 19},

    {team: 2, name: 'Martinez', id: 31},
    {team: 2, name: 'Konsa Ngoyo', id: 44},
    {team: 2, name: 'Jacob Ramsey', id: 47},

    {team: 3, name: 'A Smith', id: 57},
    {team: 3, name: 'Smith (Adam)', id: 57},
    {team: 3, name: 'L Cook', id: 67},
    {team: 3, name: 'Cook (Lewis)', id: 67},
    {team: 3, name: 'Hill', id: 539},
    {team: 3, name: 'Neto (Murara)', id: 574},

    {team: 4, name: 'Norgaard', id: 79},
    {team: 4, name: 'Raya Martin', id: 81},
    {team: 4, name: 'Josh Dasilva', id: 83},
    {team: 4, name: 'Zanka', id: 595},

    {team: 5, name: 'Sanchez', id: 113},
    {team: 5, name: 'Sanchez (Robert)', id: 113},
    {team: 5, name: 'Moises Caicedo', id: 120},
    {team: 5, name: 'Ferguson (Evan)', id: 596},

    {team: 6, name: 'Kepa', id: 133},
    {team: 6, name: 'Chalobah (Trevoh)', id: 141},
    {team: 6, name: 'James (Reece)', id: 146},
    {team: 6, name: 'Mendy (Edouard)', id: 147},
    {team: 6, name: 'Lewis Hall', id: 661},

    {team: 7, name: 'Ward (Joel)', id: 156},
    {team: 7, name: 'Jordan Ayew', id: 159},
    {team: 7, name: 'Ayew (Jordan)', id: 159},
    {team: 7, name: 'Marc Guehi', id: 167},
    {team: 7, name: 'Doucouré (Cheick)', id: 514},
    {team: 7, name: 'Doucoure', id: 514},

    {team: 8, name: 'Begovic', id: 176},
    {team: 8, name: 'Alli', id: 181},
    {team: 8, name: 'Doucouré', id: 185},
    {team: 8, name: 'Doucouré (Abdoulaye)', id: 185},
    {team: 8, name: 'Gray (Demarai)', id: 189},
    {team: 8, name: 'Mvom Onana', id: 577},

    {team: 9, name: 'Chalobah (Nathaniel)', id: 203},
    {team: 9, name: 'DeCordova-Reid', id: 205},
    {team: 9, name: 'Mitrovic', id: 210},
    {team: 9, name: 'Wilson (Harry)', id: 212},
    {team: 9, name: 'João Palhinha', id: 220},
    {team: 9, name: 'James (Daniel)', id: 231},
    {team: 9, name: 'Pereira', id: 346},
    {team: 9, name: 'Carlos Vinicius', id: 618},

    {team: 10, name: 'Summerville', id: 240},
    {team: 10, name: 'Cooper', id: 221},
    {team: 10, name: 'Ayling', id: 222},
    {team: 10, name: 'Klich', id: 223},
    {team: 10, name: 'Rodrigo', id: 225},
    {team: 10, name: 'Bamford', id: 227},
    {team: 10, name: 'Diego Llorente', id: 228},
    {team: 10, name: 'Koch', id: 230},
    {team: 10, name: 'James', id: 231},
    {team: 10, name: 'Harrison', id: 233},
    {team: 10, name: 'Struijk', id: 235},
    {team: 10, name: 'Meslier', id: 238},
    {team: 10, name: 'Gelhardt', id: 242},
    {team: 10, name: 'Kristensen', id: 244},
    {team: 10, name: 'Roca', id: 245},
    {team: 10, name: 'Aaronson', id: 246},
    {team: 10, name: 'Adams', id: 506},
    {team: 10, name: 'Adams (Tyler)', id: 506},
    {team: 10, name: 'Sinisterra', id: 508},
    {team: 10, name: 'Forshaw', id: 224},
    {team: 10, name: 'Gnonto', id: 619},

    {team: 11, name: 'Evans', id: 249},
    {team: 11, name: 'Albrighton', id: 251},
    {team: 11, name: 'Ward (Danny)', id: 254},
    {team: 11, name: 'Ward', id: 254},
    {team: 11, name: 'Vardy', id: 255},
    {team: 11, name: 'Amartey', id: 257},
    {team: 11, name: 'Castagne', id: 258},
    {team: 11, name: 'Tielemans', id: 259},
    {team: 11, name: 'Ayoze Pérez', id: 260},
    {team: 11, name: 'Maddison', id: 261},
    {team: 11, name: 'Barnes', id: 264},
    {team: 11, name: 'Ndidi', id: 265},
    {team: 11, name: 'Dewsbury-Hall', id: 266},
    {team: 11, name: 'Justin', id: 268},
    {team: 11, name: 'Soumaré', id: 269},
    {team: 11, name: 'Thomas', id: 270},
    {team: 11, name: 'Daka', id: 271},
    {team: 11, name: 'Fofana', id: 272},
    {team: 11, name: 'Praet', id: 549},
    {team: 11, name: 'Faes', id: 612},

    {team: 12, name: 'Henderson (Jordan)', id: 275},
    {team: 12, name: 'Thiago Alcántara', id: 277},
    {team: 12, name: 'Oxlade-Chamberlain', id: 278},
    {team: 12, name: 'van Dijk', id: 280},
    {team: 12, name: 'Jones (Curtis)', id: 291},
    {team: 12, name: 'Díaz', id: 293},
    {team: 12, name: 'Núñez', id: 297},

    {team: 13, name: 'Gundogan', id: 300},
    {team: 13, name: 'João Cancelo', id: 306},
    {team: 13, name: 'Bernardo Silva', id: 311},
    {team: 13, name: 'Rúben Dias', id: 312},
    {team: 13, name: 'Lewis (Rico)', id: 573},
    {team: 13, name: 'Gómez', id: 587},

    {team: 14, name: 'Cristiano Ronaldo', id: 326},
    {team: 14, name: 'Bruno Fernandes', id: 333},
    {team: 14, name: 'Lindelof', id: 337},
    {team: 14, name: 'Diogo Dalot', id: 342},

    {team: 15, name: 'Wilson (Callum)', id: 356},
    {team: 15, name: 'C Wilson', id: 356},
    {team: 15, name: 'Jacob Murphy', id: 365},
    {team: 15, name: 'Longstaff (Sean)', id: 370},
    {team: 15, name: 'Longstaff', id: 370},

    {team: 16, name: 'Williams', id: 295},
    {team: 16, name: 'Williams (Neco)', id: 295},
    {team: 16, name: 'Cook (Steve)', id: 379},
    {team: 16, name: 'S Cook', id: 379},
    {team: 16, name: 'Johnson (Brennan)', id: 394},
    {team: 16, name: 'Henderson (Dean)', id: 398},
    {team: 16, name: 'Dennis (Emmanuel)', id: 585},
    {team: 16, name: 'Gustavo Scarpa', id: 681},

    {team: 17, name: 'S Armstrong', id: 405},
    {team: 17, name: 'Armstrong (Stuart)', id: 405},
    {team: 17, name: 'Armstrong (Adam)', id: 408},
    {team: 17, name: 'A Armstrong', id: 408},
    {team: 17, name: 'Adams (Che)', id: 411},
    {team: 17, name: 'Bella Kotchap', id: 423},
    {team: 17, name: 'Juan Larios', id: 622},

    {team: 18, name: 'Davies (Ben)', id: 432},
    {team: 18, name: 'Ben Davies', id: 432},
    {team: 18, name: 'D Sanchez', id: 435},
    {team: 18, name: 'Sanchez (Davinson)', id: 435},
    {team: 18, name: 'Sessegnon (Ryan)', id: 436},
    {team: 18, name: 'Ryan Sessegnon', id: 436},
    {team: 18, name: 'Perisic', id: 448},

    {team: 19, name: 'Johnson (Ben)', id: 471},
    {team: 19, name: 'Lucas Paquetá', id: 603},

    {team: 20, name: 'Raúl Jiménez', id: 476},
    {team: 20, name: 'José Sá', id: 478},
    {team: 20, name: 'Ruben Neves', id: 480},
    {team: 20, name: 'Hwang Hee-Chan', id: 481},
    {team: 20, name: 'Neto (Pedro)', id: 486},
    {team: 20, name: 'Ait Nouri', id: 487},
    {team: 20, name: 'Traoré (Adama)', id: 491},
    {team: 20, name: 'Gonçalo Guedes', id: 579},
    {team: 20, name: 'Matheus Nunes', id: 589},
    {team: 20, name: 'Costa', id: 625},
    {team: 20, name: 'Traoré (Boubacar)', id: 629},
    {team: 20, name: 'Matheus Cunha', id: 682},
  ];

  pool.query(
    format('SELECT id, web_name AS name, team FROM players;'),
    async (error, results) => {
      if (error) {
        console.log(error.message);
      } else {
        console.log(results.command);
        const players = results.rows as PlayerToPlay[];
        const playersExpectedToPlay: PlayerToPlay[] = [];

        const getPlayerID = (team: number, name: string): number => {
          const filteredList = players.filter(
            element => element.name === name && element.team === team
          );
          if (filteredList.length === 1) return filteredList[0].id;
          const filteredList2 = playerMap.filter(
            player => player.name === name && player.team === team
          );
          if (filteredList2.length === 1) return filteredList2[0].id;

          return -1;
        };

        const {data} = await axios.get(
          'https://www.fantasyfootballscout.co.uk/team-news/'
        );

        const root = parse(data);
        const formations = root.querySelectorAll('.formation');

        formations.forEach((formation, index) => {
          const rows = formation.querySelectorAll('ul');

          rows.forEach(row => {
            const players = row.querySelectorAll('li');

            players.forEach(player => {
              const team = index + 1;
              const name = player.querySelector('.player-name')
                ?.innerHTML as string;
              const id = getPlayerID(team, name);

              playersExpectedToPlay.push({team, name, id});
            });
          });
        });

        console.log(
          JSON.stringify(playersExpectedToPlay.filter(({id}) => id === -1))
        );

        const values = players.map(({id}) => [
          id,
          !!playersExpectedToPlay.filter(player => player.id === id).length,
        ]);

        pool.query(
          format(
            'INSERT INTO players (id, selected) VALUES %L ON CONFLICT (id) DO UPDATE SET selected = EXCLUDED.selected',
            values
          ),
          (error, results) => {
            if (error) {
              console.log(error.message);
            } else {
              console.log(results.command);
            }
          }
        );
      }
    }
  );
};

type PlayerData = {
  id: number;
  team: number;
  total_points: number;
  now_cost: number;
  web_name: string;
  comment: string;
  pointsPerM: number;
  position: 1 | 2 | 3 | 4;
  nextFiveGames: number[];
};

export const findBestTeam = (
  gameweeks: number[],
  pool: Pool,
  playersToInclude: number[],
  playersToIgnoreG: number[]
) => {
  const gameweeksString = gameweeks.join(',');

  console.log({gameweeksString});

  pool.query(
    format(
      `
      SELECT 
      player_id,  web_name,
      team,       predicted_points, 
      event,       now_cost, element_type
  
  FROM "players_fixtures" 

  LEFT JOIN fixtures on fixtures.id = players_fixtures.fixture_id
  LEFT JOIN players on players.id = players_fixtures.player_id
  WHERE event in (${gameweeksString}) AND selected = TRUE
          `
    ),
    (error, results) => {
      if (error) {
        console.log(error.message);
      } else {
        console.log(results.command);

        type SQLResponse = {
          player_id: number;
          web_name: string;
          predicted_points: number;
          event: number;
          team: number;
          now_cost: number;
          element_type: 1 | 2 | 3 | 4;
        };

        const response = results.rows as SQLResponse[];

        const playerIDs = new Set(
          response
            .map(item => item.player_id)
            .filter(id1 => !playersToIgnoreG.some(id2 => id2 === id1))
        );

        const playerDataArray: PlayerData[] = [];

        const getPoints = (playerArray: SQLResponse[]) => {
          return playerArray.reduce(
            (acc, {predicted_points}) => (acc += predicted_points),
            0
          );
        };

        playerIDs.forEach(id => {
          const playerArray = response.filter(item => item.player_id === id);
          const totalPoints = getPoints(playerArray);
          const gameweekPoints = gameweeks.map(gameweek => {
            return getPoints(
              playerArray.filter(fixture => fixture.event === gameweek)
            );
          });
          const {team, web_name, element_type, now_cost} = playerArray[0];
          playerDataArray.push({
            id,
            team: team,
            total_points: totalPoints,
            now_cost: now_cost / 10,
            web_name: web_name,
            comment: '',
            pointsPerM: Math.round((totalPoints / now_cost) * 10) / 100,
            position: element_type,
            nextFiveGames: gameweekPoints,
          });
        });

        // console.table(playerDataArray);

        identifyBestTeam(playerDataArray, playersToInclude);
      }
    }
  );

  const identifyBestTeam = (
    playerDataArray: PlayerData[],
    playersToInclude: number[]
  ) => {
    const cheapestGoalkeepers = playerDataArray
      .filter(player => player.position === 1)
      .sort((a, b) => b.total_points - a.total_points)
      .sort((a, b) => a.now_cost - b.now_cost);
    const cheapestDefenders = playerDataArray
      .filter(player => player.position === 2)
      .sort((a, b) => b.total_points - a.total_points)
      .sort((a, b) => a.now_cost - b.now_cost);
    const cheapestMidfielders = playerDataArray
      .filter(player => player.position === 3)
      .sort((a, b) => b.total_points - a.total_points)
      .sort((a, b) => a.now_cost - b.now_cost);
    const cheapestStrikers = playerDataArray
      .filter(player => player.position === 4)
      .sort((a, b) => b.total_points - a.total_points)
      .sort((a, b) => a.now_cost - b.now_cost);
    const formations = [
      [1, 3, 4, 3],
      [1, 3, 5, 2],
      [1, 4, 3, 3],
      [1, 4, 4, 2],
      [1, 4, 5, 1],
      [1, 5, 3, 2],
      [1, 5, 4, 1],
    ];
    const bestTeams: PlayerData[][] = [];
    formations.forEach(formation => {
      const positions = {
        1: formation[0],
        2: formation[1],
        3: formation[2],
        4: formation[3],
      };
      const maxPositions = {
        1: 2,
        2: 5,
        3: 5,
        4: 3,
      };
      const subs: PlayerData[] = [];
      let gks = 0,
        dfs = 0,
        mfs = 0,
        fws = 0;
      playerDataArray.forEach(player => (player.comment = ''));
      for (let i = 0; i < 5; i++) {
        for (
          let j = positions[i as 1 | 2 | 3 | 4];
          j < maxPositions[i as 1 | 2 | 3 | 4];
          j++
        ) {
          if (i === 1) {
            subs.push(cheapestGoalkeepers[gks]);
            gks += 1;
          }
          if (i === 2) {
            subs.push(cheapestDefenders[dfs]);
            dfs += 1;
          }
          if (i === 3) {
            subs.push(cheapestMidfielders[mfs]);
            mfs += 1;
          }
          if (i === 4) {
            subs.push(cheapestStrikers[fws]);
            fws += 1;
          }
          subs[subs.length - 1].comment = 'S';
        }
      }
      const maxCost = 130;
      const playersToIgnore: number[] = [];
      const playersToIgnore2: number[] = [];
      let finalTeam: PlayerData[] = [];
      let total_cost = maxCost + 1;
      while (total_cost > maxCost) {
        console.log({playersToIgnore, playersToInclude});
        total_cost = 0;
        // const selectedTeam: PlayerData[] = [];
        const selectedTeam: PlayerData[] = playerDataArray.filter(player =>
          playersToInclude.some(id => player.id === id)
        );
        console.table(selectedTeam);
        playerDataArray
          .filter(player => !subs.some(({id}) => player.id === id))
          .filter(player => !playersToIgnore.some(id => player.id === id))
          .filter(player => !playersToIgnore2.some(id => player.id === id))
          .filter(player => !playersToInclude.some(id => player.id === id))
          .sort((a, b) => b.total_points - a.total_points)
          .every(player => {
            const {team, position} = player;
            if (selectedTeam.filter(player => player.team === team).length >= 3)
              return true; // checks that there is no more than 3 players from any given team
            if (
              selectedTeam.filter(player => player.position === position)
                .length >= positions[position]
            )
              return true; // checks that there are not to many from the same position
            selectedTeam.push(player);
            if (selectedTeam.length + subs.length === 15) return false;
            return true;
          });
        if (selectedTeam.length + subs.length === 15) {
          finalTeam = selectedTeam.concat(subs);
          total_cost = finalTeam.reduce(
            (acc, player) => (acc += player.now_cost),
            0
          );
          finalTeam.sort((a, b) => b.nextFiveGames[0] - a.nextFiveGames[0]);
          finalTeam.forEach((player, index) => {
            if (player.comment !== 'S') {
              switch (index) {
                case 0:
                  player.comment = 'C';
                  break;
                case 1:
                  player.comment = 'VC';
                  break;
                default:
                  player.comment = '';
                  break;
              }
            }
          });
          finalTeam.sort((a, b) => a.position - b.position);
          selectedTeam.sort((a, b) => a.pointsPerM - b.pointsPerM);

          const tempST = selectedTeam.filter(
            player => !playersToInclude.some(id => player.id === id)
          );

          playersToIgnore.push(tempST[0].id);
          console.table(tempST);
          console.log({playersToIgnore});
        } else {
          console.log('reset');

          while (playersToIgnore.length > 0) {
            playersToIgnore.pop();
          }
          total_cost = 101;
          let incompletePosition = -1;
          Object.entries(positions).forEach(([position, positionNo]) => {
            if (
              selectedTeam.filter(
                player => player.position === parseInt(position)
              ).length !== positionNo
            ) {
              incompletePosition = parseInt(position);
            }
          });
          playersToIgnore2.push(
            selectedTeam
              .filter(player => !playersToInclude.some(id => player.id === id))
              .filter(player => player.position !== incompletePosition)
              .sort((a, b) => a.pointsPerM - b.pointsPerM)[0].id
          );
        }
      }
      bestTeams.push(JSON.parse(JSON.stringify(finalTeam)));
    });
    const totalCost = (team: PlayerData[]): number => {
      return team.reduce((acc, player) => (acc += player.now_cost), 0);
    };
    const totalPoints = (team: PlayerData[]): number => {
      return team.reduce((acc, player) => {
        if (player.comment !== 'S') {
          acc += player.total_points;
        }
        return acc;
      }, 0);
    };
    bestTeams
      .sort((a, b) => totalPoints(a) - totalPoints(b))
      .forEach(team => {
        console.table(team.filter(team => team.comment !== 'S'));
        console.table(team.filter(team => team.comment === 'S'));
        console.log({
          total_cost: totalCost(team),
          total_points: totalPoints(team),
        });
      });
  };
};
