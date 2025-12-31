import "./styles.css";
import DiceBox from "@3d-dice/dice-box";
import DisplayResults from "@3d-dice/dice-ui/src/displayResults";
import AdvancedRoller from "@3d-dice/dice-ui/src/advancedRoller";
import BoxControls from "@3d-dice/dice-ui/src/boxControls";

let Box = new DiceBox("#dice-box", {
  assetPath: "/public/assets/dice-box/",
  theme: "default",
  offscreen: true,
  scale: 6
});

// document.addEventListener("DOMContentLoaded", async () => {
Box.init().then(async (world) => {
  // //console.log("Box is ready");

  const Controls = new BoxControls({
    themes: ["default", "rust", "diceOfRolling", "gemstone"],
    themeColor: world.config.themeColor,
    onUpdate: (updates) => {
      Box.updateConfig(updates);
    }
  });
  Controls.themeSelect.setValue(world.config.theme);

  Box.onThemeConfigLoaded = (themeData) => {
    if (themeData.themeColor) {
      Controls.themeColorPicker.setValue(themeData.themeColor);
    }
  };

  // create display overlay
  const Display = new DisplayResults("#dice-box");

  // // create Roller Input
  const Roller = new AdvancedRoller({
    target: "#dice-box",
    onSubmit: (notation) => Box.roll(notation),
    onClear: () => {
      Box.clear();
      Display.clear();
    },
    onReroll: (rolls) => {
      // loop through parsed roll notations and send them to the Box
      rolls.forEach((roll) => Box.add(roll, roll.groupId));
    },
    onResults: (results) => {
      //console.log(results);
      Display.showResults(results);
    }
  });

  // pass dice rolls to Advanced Roller to handle
  Box.onRollComplete = (results) => {
    Roller.handleResults(results);
  };
  Box.roll(["4d20", "4d12", "4d10", "4d8", "4d6", "4d4"]);
});
// });

// const reRoll = () => {
//   Box.clear();
//   Box.roll(["4d20", "4d12", "4d10", "4d8", "4d6", "4d4"]);
// };

// const rollBtn = document.getElementById("roll");

// rollBtn.addEventListener("click", reRoll);
