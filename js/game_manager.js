function GameManager(size, InputManager, Actuator, StorageManager) {
  this.size = size; //Размер на решетката;
  this.inputManager = new InputManager; //Обект, който да менажира входящите действия;
  this.storageManager = new StorageManager;
  this.actuator = new Actuator; //Задвижващото устройство;

  this.startTiles = 2; //Брой начални точки;

  this.inputManager.on("move", this.move.bind(this));
  this.inputManager.on("restart", this.restart.bind(this));
  this.inputManager.on("keepPlaying", this.keepPlaying.bind(this));

  this.setup();
}
//Нова игра:
GameManager.prototype.restart = function () {
  this.storageManager.clearGameState();
  this.actuator.continueGame();//Изчиства съобщението за победа/загуба;
  this.setup();
};
//Продължаване на игра, след достигане на 1024;
GameManager.prototype.keepplaying = function () {
  this.keepplaying = true;
  this.actuator.continuegame(); //Изчиства съобщението за победа/загуба;
};
//Връща true, ако играта е приключила:
GameManager.prototype.isGameTerminated = function () {
  return this.over || (this.won && !this.keepPlaying);
};
//Нагласяне на играта:
GameManager.prototype.setup = function () {
  var previousState = this.storageManager.getGameState();
  //Зарежда предишна игра, ако е налична;
  if (previousState) {
    this.grid = new Grid(previousState.grid.size, previousState.grid.cells); //Презарежда grid-а;
    this.score = previousState.score;
    this.over = previousState.over;
    this.won = previousState.won;
    this.keepPlaying = previousState.keepPlaying;
  } else {
    this.grid = new Grid(this.size);
    this.score = 0;
    this.over = false;
    this.won = false;
    this.keepPlaying = false;
    //Добавяне на началните плочки:
    this.addStartTiles();
  }
  //Задействане: 
  this.actuate();
};
//Функията, която генерира началните плочки;
GameManager.prototype.addStartTiles = function () {
  for (var i = 0; i < this.startTiles; i++) {
    this.addRandomTile();
  }
};

//Добавяне на плочка на произволно място
GameManager.prototype.addRandomTile = function () {
  if (this.grid.cellsAvailable()) {
    var value = Math.random() < 0.9 ? 2 : 4;
    var tile = new Tile(this.grid.randomAvailableCell(), value);
    this.grid.insertTile(tile);
  }
};

// Sends the updated grid to the actuator
GameManager.prototype.actuate = function () {
  //Изчистване при прекратена игра(загуба);
  if (this.over) {
    this.storageManager.clearGameState();
  } else {
    this.storageManager.setGameState(this.serialize());
  }
  this.actuator.actuate(this.grid, {
    score: this.score,
    over: this.over,
    won: this.won,
    terminated: this.isGameTerminated()
  });
};
//Превръщане на играта в обект;
GameManager.prototype.serialize = function () {
  return {
    grid: this.grid.serialize(),
    score: this.score,
    over: this.over,
    won: this.won,
    keepPlaying: this.keepPlaying
  };
};
//Запазване на плочки
GameManager.prototype.prepareTiles = function () {
  this.grid.eachCell(function (x, y, tile) {
    if (tile) {
      tile.mergedFrom = null;
      tile.savePosition();
    }
  });
};
//Движене на плочка
GameManager.prototype.moveTile = function (tile, cell) {
  this.grid.cells[tile.x][tile.y] = null;
  this.grid.cells[cell.x][cell.y] = tile;
  tile.updatePosition(cell);
};
//Движение според посоката
GameManager.prototype.move = function (direction) {
  //0: нагоре, 1: надясно, 2: надолу, 3: наляво
  var self = this;
  if (this.isGameTerminated()) return; //Ако играта свърши - не прави нищо.
  var cell, tile;
  var vector = this.getVector(direction);
  var traversals = this.buildTraversals(vector);
  var moved = false;
  
  
  this.prepareTiles();
  //Преместване на всичко в посочената посока;
  traversals.x.forEach(function (x) {
    traversals.y.forEach(function (y) {
      cell = { x: x, y: y };
      tile = self.grid.cellContent(cell);

	  
      if (tile) {
        var positions = self.findFarthestPosition(cell, vector);
        var next = self.grid.cellContent(positions.next);

        if (next && next.value === tile.value && !next.mergedFrom) {
          var merged = new Tile(positions.next, tile.value * 2);
          merged.mergedFrom = [tile, next];

          self.grid.insertTile(merged);
          self.grid.removeTile(tile);
			//Обновяване на позицията
          tile.updatePosition(positions.next);
          //Обновяне на резултата;
          self.score += merged.value;
          //Проверка за победа;
          if (merged.value === 1024) self.won = true;
        } else {
          self.moveTile(tile, positions.farthest);
        }
        if (!self.positionsEqual(cell, tile)) {
          moved = true; //Преместване - успешно
        }
      }
    });
  });
  if (moved) {
    this.addRandomTile();
    if (!this.movesAvailable()) {
      this.over = true; //Загуба :( 
    }
    this.actuate();
  }
};

//Генериране на вектор за движение
GameManager.prototype.getVector = function (direction) {
  //Вектор на движението;
  var map = {
    0: { x: 0,  y: -1 }, //Нагоре
    1: { x: 1,  y: 0 }, //Надясно
    2: { x: 0,  y: 1 }, //Надолу
    3: { x: -1, y: 0 } //Наляво
  };
  return map[direction];
};

//Лист от правилни позиции
GameManager.prototype.buildTraversals = function (vector) {
  var traversals = { x: [], y: [] };
  
  
  for (var pos = 0; pos < this.size; pos++) {
    traversals.x.push(pos);
    traversals.y.push(pos);
  }
  //Винаги да се отместват до край
  if (vector.x === 1) traversals.x = traversals.x.reverse();
  if (vector.y === 1) traversals.y = traversals.y.reverse();
  return traversals;
};

GameManager.prototype.findFarthestPosition = function (cell, vector) {
  var previous;
  //Да се местят докато е възможно
  do {
    previous = cell;
    cell = { x: previous.x + vector.x, y: previous.y + vector.y };
  } while (this.grid.withinBounds(cell) &&
           this.grid.cellAvailable(cell));
  return {
    farthest: previous,
    next: cell
  };
};


//Проверка за налични ходове
GameManager.prototype.movesAvailable = function () {
  return this.grid.cellsAvailable() || this.tileMatchesAvailable();
};


//Проверка за възможни сливания"
GameManager.prototype.tileMatchesAvailable = function () {
  var self = this;
  var tile;
  for (var x = 0; x < this.size; x++) {
    for (var y = 0; y < this.size; y++) {
      tile = this.grid.cellContent({ x: x, y: y });

      if (tile) {
        for (var direction = 0; direction < 4; direction++) {
          var vector = self.getVector(direction);
          var cell   = { x: x + vector.x, y: y + vector.y };
          var other  = self.grid.cellContent(cell);
          if (other && other.value === tile.value) {
            return true; //Възможно е сливане между тези две плочки;
          }
        }
      }
    }
  }
  return false; //Няма възможни сливания;
};
//Обединяване на позиции на слети клетки;
GameManager.prototype.positionsEqual = function (first, second) {
  return first.x === second.x && first.y === second.y;
};
