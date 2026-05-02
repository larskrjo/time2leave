module.exports = function (api) {
    api.cache(true);
    return {
        // `babel-preset-expo` already wires the worklets plugin for
        // `react-native-reanimated` v4 + `react-native-worklets`. We
        // intentionally do NOT add the plugin manually — doing so
        // double-applies it and trips Metro's "duplicate plugin" check.
        presets: ["babel-preset-expo"],
    };
};
