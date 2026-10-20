A trading training game

# 1. Module:
1. Price charts capture
2. Order manager
3. User settings
4. Summary and statistics

# 2. Price Charts Capture

1. Choose a random accurate time as the start time, for example 2024-10-07 12:05
2. Get the interval from user settings
3. Capture up to 1500 candles before this time, are there any recommended libraries to capture the price charts?
4. The start time less than current and larger than 2022-01-01 00:00(hard code). If candels less than 500, change a start time.
5. The chart hides the real price, for example, BTC price is 74392, don't display this price. The close price of the last candle is 100, then calculate others' open and close price
6. If possible, use Trading View as the chart provider

## 2.1 User Operations of Price Chart:

1. Play: Play candles automatically, 1 candel per second, user can pause and resume the play. There is dropdown menu to adjust the speed, options: 1x, 2x, 5x, 10x, 20x
2. Next: Show the next candle, user can click this button to show the next candle. Long press or press down right arrow key to show candles continuously, 5 candels per second, user can release to stop the continuous show
3. Finish: Show all remaining candles, up to 300. This is a one-time operation, user can click this button to show all remaining candles, and this turn is over. User can start a new turn
4. Repick: Repick a new start time, and capture new candles. If user has already placed an order, whatever the order status is, the repick operation will be disabled forever, until the user starts a new turn

# 3. Order Manager

## 3.1 User Operations of Order Manager:

1. Supports stop market order, limit order and market order, use a tab switcher to switch between them
2. A Long button and a Short button
3. The user can adjust the stop price manually
4. A stop loss order is required for each trade, and the user can adjust the stop loss price manually
5. The position size is automatically calculated based on the user's account balance and risk percentage, which can be set in user settings. User can not adjust the position size manually.
6. User can adjust the leverage, options: 2x, 3x, 5x, 10x
7. Initially, the order manager doesn't display any order operations, just a button with text start trading, when the user clicks this button, the order manager will display the order operations, and provide three horizontal lines on price charts, one for stop price, one for stop loss price, and one for take profit price. The user can drag these lines to adjust the prices.
8. Only cross margin is supported
9. Fee: 0.05% for maker and taker, the fee is deducted from the account balance when the order is filled
10. Slippage: 0.01%

## 3.2 Open Interest

1. Long or Short
2. Leverage
3. Position Size
4. Unrealized PnL
5. Entry Price
6. Last Price
7. Liquidation Price
8. Stop Loss Price
9. Take Profit Price

If user resizes the position, calculate and update the status automatically

## 3.3 Position Manager

1. Close Position: 25% of the position, 50% of the position, 75% of the position, 100% of the position
2. Modify Take Profit Price: When user clicks this button, he can drag the take profit line on the price chart or write a new price manually to modify the take profit price
3. Modify Stop Loss Price: Same to above

# 4. User settings

1. Balance. Default to 10000 USDT, user cannot adjust this value.
2. Risk percentage. Default to 1%, user can adjust this value. It indicates the percentage of the account balance that the user is willing to risk on a single trade.
3. Candle interval. Default to 5 minutes, user can adjust this value. Options: 5 minutes, 15 minutes, 30 minutes, 1 hour, 4 hours, 1 day

# 5. Page Overview

## Page Top

Left:

- Balance
- Realized PnL of this game, Unrealized PnL of this game
- Progress bar of this game
- Win Rate of this game
- Trade Count of this game
- Fee

Right:

1. User settings button
2. Summary and statistics button(To view the summary and statistics of the game)

## Page Left

Price Chart: As big as possible

## Page Right

- Order Manager
- Open Interest
- Order Delegation
- Game Status:
 - Unrealized PnL of this turn
 - Realized PnL of this turn 
 - Fee of this turn

# 6. Steps of the game

## 6.1 Concepts

- A Turn: A single trading session where the user can place trades based on the captured price charts. Each turn starts with a new random start time and a fresh set of candles. If user click the Finish button, the turn will end and user can start a new turn. If user click the Repick button, the turn will not end.
- A Game: 20 turns, the user can play 20 turns in a game. After 20 turns, the game ends and the user can see the summary and statistics of their performance.

NOTE:
1. User can trading in a turn many times, free to open and close positions, but the turn will end when user click the Finish button. User can start a new turn after the turn ends.
2. If user encountered liquidation, the game will end immediately, and user can see the summary and statistics of their performance. 

## 6.2 Steps

1. User open the website
2. No chart at default. User can click a button to start a new game
3. User trading in a turn or start a new turn
4. After 20 turns, user encounters liquidation, or user click the Finish button, the game ends and user can see the summary and statistics of their performance

NOTE:
- You design the summary page
- There are some details I didn't mention above, please refer to Trading View or mainstream exchanges for reference, and design the game reasonably
- This is a totally local game, no backend, just fetch price charts from Trading View or other chart providers, and all the trading operations are simulated locally
- Record summary for up to 10 games

# Tech Stacks

Nextjs, pnpm, docker(if required)
