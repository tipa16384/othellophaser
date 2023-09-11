const dwidth = 800;
const dheight = 600;

const score_url = 'https://ifdero7svk.execute-api.us-east-1.amazonaws.com/test/high-scores';
const back_end_url = "http://127.0.0.1:5000/"

const config = {
    type: Phaser.AUTO,
    backgroundColor: '#afe9af',
    // scale to 740 px across
    scale: {
        parent: 'game',
        mode: Phaser.Scale.FIT,
        width: dwidth,
        height: dheight
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);
let piece_sprites = null;
let last_response = null;
let notation = "";
let computer_player = 'O';
let old_computer_player = 'X';
let waiting_for_computer = false;
let waiting_for_intro = true;
let opening_name = null;

function preload() {
    this.load.setBaseURL('.');

    // load sprite sheet asteroids_ship_map.png, 50x26 pixels per frame, 2 frames vertically stacked
    this.load.spritesheet('pieces', 'assets/pieces.png', { frameWidth: 50, frameHeight: 50 });
    this.load.spritesheet('buttons', 'assets/buttons.png', { frameWidth: 150, frameHeight: 54 });

    this.load.image('board', 'assets/board.png');
    this.load.image('whitebackground', 'assets/wbackground.png');
    this.load.image('blackbackground', 'assets/ravenmap.png');
    this.load.image('introbackground', 'assets/introscreen.png');
}

function create() {
    this.whiteBoard = this.add.image(400, 300, 'whitebackground');
    this.whiteBoard.setVisible(false);
    this.blackBoard = this.add.image(400, 300, 'blackbackground');
    this.blackBoard.setVisible(false);
    this.introscreen = this.add.image(400, 300, 'introbackground');
    waiting_for_intro = true;

    // add text object to top middle of screen that displays the word "Opening" in white
    this.openingText = this.add.text(300, 5, 'Opening', { fontFamily: 'Arial', fontSize: 24, color: '#000000' }).setOrigin(0.5, 0);

    // create an 8x8 array of sprites for the pieces. The sprites are 50x50 pixels
    piece_sprites = [];
    for (let i = 0; i < 8; i++) {
        piece_sprites[i] = [];
        for (let j = 0; j < 8; j++) {
            piece_sprites[i][j] = this.add.sprite(82 + 62.75 * j, 70 + 62.75 * i, 'pieces');
            // frame is random number between 0 and 2
            piece_sprites[i][j].setFrame(Math.floor(Math.random() * 2));
            piece_sprites[i][j].setVisible(false);
        }
    }

    const button_base = 60;
    const button_separation = 60;

    this.play_button = this.add.sprite(400, 550, 'buttons');
    this.play_button.setFrame(10);
    this.play_button.setInteractive();

    // on pointer up, set frame to 0
    this.play_button.on('pointerup', function (pointer) {
        // reset the game
        reset_game();
        // randomly choose X or O
        computer_player = (Math.random() < 0.5) ? 'X' : 'O';
        waiting_for_intro = false;
        updateBoardFromBackEnd();
    });

    // set a button with button sprite 0 at 700, 100
    this.new_game_button = this.add.sprite(675, button_base, 'buttons');
    this.new_game_button.setFrame(0);
    this.new_game_button.setInteractive();
    this.new_game_button.setVisible(false);
    this.new_game_button.on('pointerdown', function (pointer) {
        // set frame to 1
        this.scene.new_game_button.setFrame(1);
    });

    // on pointer up, set frame to 0
    this.new_game_button.on('pointerup', function (pointer, currentlyOver) {
        this.scene.new_game_button.setFrame(0);
        // reset the game
        reset_game();
        computer_player = (computer_player === 'X') ? 'O' : 'X';
        updateBoardFromBackEnd();
    });

    this.resign_button = this.add.sprite(675, button_base, 'buttons');
    this.resign_button.setFrame(5);
    this.resign_button.setInteractive();
    this.resign_button.setVisible(true);
    this.resign_button.on('pointerdown', function (pointer) {
        // set frame to 6
        this.scene.resign_button.setFrame(6);
    });

    // on pointer up, set frame to 5
    this.resign_button.on('pointerup', function (pointer, currentlyOver) {
        this.scene.resign_button.setFrame(5);
        if (last_response.current_player === 'X') {
            last_response.black_score = 0;
            last_response.white_score = 64;
        } else {
            last_response.black_score = 64;
            last_response.white_score = 0;
        }
        last_response.game_over = true;
    });

    // game over button is frame 2 of buttons
    this.game_over_button = this.add.sprite(675, button_base + button_separation, 'buttons');
    this.game_over_button.setFrame(2);
    this.game_over_button.setVisible(false);

    // white won button is frame 3 of buttons
    this.white_won_button = this.add.sprite(675, button_base + button_separation * 2, 'buttons');
    this.white_won_button.setFrame(3);
    this.white_won_button.setVisible(false);

    // black won button is frame 4 of buttons
    this.black_won_button = this.add.sprite(675, button_base + button_separation * 2, 'buttons');
    this.black_won_button.setFrame(4);
    this.black_won_button.setVisible(false);

    if (!waiting_for_intro) {
        updateBoardFromBackEnd();
    }

    // add an event listener to the boardImage to handle mouse clicks
    this.whiteBoard.setInteractive();
    this.whiteBoard.on('pointerdown', handle_board_click);
    this.blackBoard.setInteractive();
    this.blackBoard.on('pointerdown', handle_board_click);
}

function handle_board_click(pointer) {
    if (last_response.game_over) {
        // make error sound and return
        return;
    }

    const current_player = last_response.current_player;
    if (current_player === computer_player) {
        // make error sound and return
        return;
    }

    // get the x and y coordinates of the mouse click relative to the boardImage
    const x = pointer.x - 55;
    const y = pointer.y - 35;

    // calculate the row and column of the mouse click
    const row = Math.floor(y / 62.75);
    const col = Math.floor(x / 62.75);

    // convert to notation. column is upper case letter if current_player is 'X', lower case letter if 'O', row is number, 1-based

    const notation_col = (current_player === 'X') ? String.fromCharCode(65 + col) : String.fromCharCode(97 + col);
    const notation_row = (row + 1).toString();
    const move_location = notation_col + notation_row;

    // if last_response.valid_moves does not contain move_location, then make error sound and return    
    if (!last_response.valid_moves.includes(move_location)) {
        return;
    }

    notation += move_location;
    updateBoardFromBackEnd();
}

function update() {
    this.introscreen.setVisible(waiting_for_intro);

    this.openingText.setVisible(!waiting_for_intro && opening_name !== null);
    if (opening_name !== null) {
        this.openingText.setText(opening_name);
    }

    if (!waiting_for_intro) {
        this.introscreen.setVisible(false);
        this.play_button.setVisible(false);
        if (computer_player === 'X') {
            this.whiteBoard.setVisible(false);
            this.blackBoard.setVisible(true);
        } else {
            this.whiteBoard.setVisible(true);
            this.blackBoard.setVisible(false);
        }
    }

    if (notation !== "") {
        this.resign_button.setVisible(true);
    } else {
        this.resign_button.setVisible(false);
    }

    if (last_response === null) {
        return;
    }

    if (last_response["game_over"]) {
        this.resign_button.setVisible(false);
    }

    if (!last_response.game_over && last_response.current_player === computer_player && !waiting_for_computer) {
        waiting_for_computer = true;
        findBestMoveFromBackEnd();
    }

    if (last_response.game_over) {
        this.game_over_button.setVisible(true);
        this.new_game_button.setVisible(true);
        if (last_response.black_score <= last_response.white_score) {
            this.white_won_button.setVisible(true);
        }
        if (last_response.black_score > last_response.white_score) {
            this.black_won_button.setVisible(true);
        }
    }

    if (!last_response.game_over) {
        this.game_over_button.setVisible(false);
        this.white_won_button.setVisible(false);
        this.black_won_button.setVisible(false);
        this.new_game_button.setVisible(false);
    }
}

function updateBoard(response) {
    last_response = response;
    board = response.board;
    waiting_for_computer = false;
    let last_move_col = -1;
    let last_move_row = -1;

    // if notation is not empty, then get the last two characters of notation
    if (notation.length > 1) {
        const last_two = notation.slice(-2);
        // make it upper case
        const last_two_upper = last_two.toUpperCase();
        // convert that to a column and row
        last_move_col = last_two_upper.charCodeAt(0) - 65;
        last_move_row = parseInt(last_two_upper.charAt(1)) - 1;
    }
    // update the board from the data
    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            let frame_mod = 0;
            if (y == last_move_row && x == last_move_col) {
                frame_mod = 2;
            }
            let bp = board[y][x];

            if (bp == ".") {
                piece_sprites[y][x].setVisible(false);
            } else if (bp == 'X') {
                piece_sprites[y][x].setFrame(1 + frame_mod);
                piece_sprites[y][x].setVisible(true);
            } else if (bp == 'O') {
                piece_sprites[y][x].setFrame(0 + frame_mod);
                piece_sprites[y][x].setVisible(true);
            }
        }
    }
}

function makeBestMove(response) {
    let best_move = response.best_move;

    if (response.opening_name !== null) {
        opening_name = response.opening_name;
    }
    
    if (best_move !== null) {
        notation += best_move;
        updateBoardFromBackEnd();
    }
}

function reset_game() {
    notation = "";
    opening_name = null;
}

function findBestMoveFromBackEnd() {
    // make ajax call to get best move from back end using jQuery
    $.ajax({
        type: 'GET',
        url: back_end_url + 'othello',
        contentType: 'application/json',
        // add notation as a query parameter
        data: { notation: notation, bestmove: 'True' }
    }).done(function (data) {
        // update the board from the data
        makeBestMove(data);
    });
}

function updateBoardFromBackEnd() {
    // make ajax call to get board from back end using jQuery

    $.ajax({
        type: 'GET',
        url: back_end_url + 'othello',
        contentType: 'application/json',
        // add notation as a query parameter
        data: { notation: notation }
    }).done(function (data) {
        // update the board from the data
        updateBoard(data);
    });
}

function postHighScore(highScore) {

    const requestBody = JSON.stringify({
        gameKey: 'othello',
        highScore: highScore
    });

    $.ajax({
        type: 'POST',
        url: score_url, // Replace with the resource path
        contentType: 'application/json',
        data: requestBody,
        success: function (data) {
            console.log(data.message); // Message from the Lambda function
        },
        error: function (error) {
            console.error('Error:', error);
        }
    });
}

function showHighScores() {

    // Make ajax call to get high scores with jQuery

    const thisProxy = this;

    var xhttp = new XMLHttpRequest();

    xhttp.onreadystatechange = function () {
        if (this.readyState == 4 && this.status == 200) {

            const highScores = JSON.parse(this.responseText);
            // set the text objects in thisProxy.textGroup to the high scores
            for (let i = 0; i < 10; i++) {
                const text = thisProxy.textGroup.getChildren()[i];
                if (i < highScores.length) {
                    // set text to high score followed by the date. the date is in ISO form. We want the date in mm/dd/yyyy format
                    const date = new Date(highScores[i].scoreDate);
                    text.setText(highScores[i].highScore.toString().padStart(6, '0') + ' ' + (date.getMonth() + 1).toString().padStart(2, '0') + '/' + date.getDate().toString().padStart(2, '0') + '/' + date.getFullYear().toString());

                    // if the high score is the same as the current score, then set the color to yellow
                    if (highScores[i].highScore == thisProxy.score) {
                        text.setColor('#ffff00');
                    }
                    else {
                        text.setColor('#ffffff');
                    }
                }
                else {
                    text.setText('');
                    text.setColor('#ffffff');
                }
            }

            // make the textGroup visible
            thisProxy.textGroup.setVisible(true);
        }
    };
    xhttp.open("GET", score_url + "?gameKey=othello", true);
    xhttp.send();
}
