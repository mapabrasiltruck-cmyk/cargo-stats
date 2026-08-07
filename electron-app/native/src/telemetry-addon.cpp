#include <napi.h>
#include <windows.h>
#include <cstring>
#include "scs-telemetry-common.hpp"

class TelemetryReader {
    HANDLE hMapFile;
    scsTelemetryMap_t* pData;

public:
    TelemetryReader() : hMapFile(NULL), pData(NULL) {}

    ~TelemetryReader() { Close(); }

    bool Open() {
        Close();
        hMapFile = OpenFileMappingW(FILE_MAP_READ, FALSE, SCS_PLUGIN_MMF_NAME);
        if (!hMapFile) return false;
        pData = (scsTelemetryMap_t*)MapViewOfFile(hMapFile, FILE_MAP_READ, 0, 0, SCS_PLUGIN_MMF_SIZE);
        if (!pData) { CloseHandle(hMapFile); hMapFile = NULL; return false; }
        return true;
    }

    void Close() {
        if (pData) { UnmapViewOfFile(pData); pData = NULL; }
        if (hMapFile) { CloseHandle(hMapFile); hMapFile = NULL; }
    }

    bool IsOpen() const { return pData != NULL; }

    Napi::Object Read(Napi::Env env) {
        Napi::Object result = Napi::Object::New(env);

        if (!pData) {
            result.Set("error", "Shared memory not open");
            return result;
        }

        scsTelemetryMap_t data;
        memcpy(&data, pData, sizeof(data));

        Napi::Object game = Napi::Object::New(env);
        game.Set("connected", Napi::Boolean::New(env, data.sdkActive != 0));
        game.Set("paused", Napi::Boolean::New(env, data.paused != 0));
        const char* gameName = "Unknown";
        if (data.scs_values.game == ETS2) gameName = "ETS2";
        else if (data.scs_values.game == ATS) gameName = "ATS";
        game.Set("gameName", Napi::String::New(env, gameName));
        game.Set("timeScale", Napi::Number::New(env, data.common_f.scale));
        game.Set("gameTime", Napi::Number::New(env, data.common_ui.time_abs));
        game.Set("sdkActive", Napi::Boolean::New(env, data.sdkActive != 0));
        result.Set("game", game);

        Napi::Object truck = Napi::Object::New(env);
        truck.Set("speed", Napi::Number::New(env, data.truck_f.speed * 3.6f));
        truck.Set("speedMs", Napi::Number::New(env, data.truck_f.speed));
        truck.Set("engineRpm", Napi::Number::New(env, data.truck_f.engineRpm));
        truck.Set("gear", Napi::Number::New(env, data.truck_i.gear));
        truck.Set("gearDashboard", Napi::Number::New(env, data.truck_i.gearDashboard));
        truck.Set("fuel", Napi::Number::New(env, data.truck_f.fuel));
        truck.Set("fuelAverageConsumption", Napi::Number::New(env, data.truck_f.fuelAvgConsumption));
        truck.Set("fuelRange", Napi::Number::New(env, data.truck_f.fuelRange));
        truck.Set("adblue", Napi::Number::New(env, data.truck_f.adblue));
        truck.Set("odometer", Napi::Number::New(env, data.truck_f.truckOdometer));
        truck.Set("oilPressure", Napi::Number::New(env, data.truck_f.oilPressure));
        truck.Set("oilTemperature", Napi::Number::New(env, data.truck_f.oilTemperature));
        truck.Set("waterTemperature", Napi::Number::New(env, data.truck_f.waterTemperature));
        truck.Set("batteryVoltage", Napi::Number::New(env, data.truck_f.batteryVoltage));
        truck.Set("airPressure", Napi::Number::New(env, data.truck_f.airPressure));
        truck.Set("brakeTemperature", Napi::Number::New(env, data.truck_f.brakeTemperature));
        truck.Set("cruiseControlSpeed", Napi::Number::New(env, data.truck_f.cruiseControlSpeed * 3.6f));
        truck.Set("wearEngine", Napi::Number::New(env, data.truck_f.wearEngine));
        truck.Set("wearTransmission", Napi::Number::New(env, data.truck_f.wearTransmission));
        truck.Set("wearCabin", Napi::Number::New(env, data.truck_f.wearCabin));
        truck.Set("wearChassis", Napi::Number::New(env, data.truck_f.wearChassis));
        truck.Set("wearWheels", Napi::Number::New(env, data.truck_f.wearWheels));
        truck.Set("make", Napi::String::New(env, data.config_s.truckBrand));
        truck.Set("model", Napi::String::New(env, data.config_s.truckName));
        truck.Set("id", Napi::String::New(env, data.config_s.truckId));
        truck.Set("brandId", Napi::String::New(env, data.config_s.truckBrandId));
        truck.Set("licensePlate", Napi::String::New(env, data.config_s.truckLicensePlate));
        truck.Set("licensePlateCountry", Napi::String::New(env, data.config_s.truckLicensePlateCountry));
        truck.Set("engineOn", Napi::Boolean::New(env, data.truck_b.engineEnabled != 0));
        truck.Set("electricOn", Napi::Boolean::New(env, data.truck_b.electricEnabled != 0));
        truck.Set("parkBrakeOn", Napi::Boolean::New(env, data.truck_b.parkBrake != 0));
        truck.Set("motorBrakeOn", Napi::Boolean::New(env, data.truck_b.motorBrake != 0));
        truck.Set("wipersOn", Napi::Boolean::New(env, data.truck_b.wipers != 0));
        truck.Set("cruiseControlOn", Napi::Boolean::New(env, data.truck_b.cruiseControl != 0));
        truck.Set("lightsBeamLowOn", Napi::Boolean::New(env, data.truck_b.lightsBeamLow != 0));
        truck.Set("lightsBeamHighOn", Napi::Boolean::New(env, data.truck_b.lightsBeamHigh != 0));
        truck.Set("lightsParkingOn", Napi::Boolean::New(env, data.truck_b.lightsParking != 0));
        truck.Set("lightsBeaconOn", Napi::Boolean::New(env, data.truck_b.lightsBeacon != 0));
        truck.Set("lightsBrakeOn", Napi::Boolean::New(env, data.truck_b.lightsBrake != 0));
        truck.Set("lightsReverseOn", Napi::Boolean::New(env, data.truck_b.lightsReverse != 0));
        truck.Set("lightsHazardOn", Napi::Boolean::New(env, data.truck_b.lightsHazard != 0));
        truck.Set("blinkerLeftOn", Napi::Boolean::New(env, data.truck_b.blinkerLeftOn != 0));
        truck.Set("blinkerRightOn", Napi::Boolean::New(env, data.truck_b.blinkerRightOn != 0));
        truck.Set("blinkerLeftActive", Napi::Boolean::New(env, data.truck_b.blinkerLeftActive != 0));
        truck.Set("blinkerRightActive", Napi::Boolean::New(env, data.truck_b.blinkerRightActive != 0));
        truck.Set("differentialLock", Napi::Boolean::New(env, data.truck_b.differentialLock != 0));
        truck.Set("liftAxle", Napi::Boolean::New(env, data.truck_b.liftAxle != 0));
        truck.Set("liftAxleIndicator", Napi::Boolean::New(env, data.truck_b.liftAxleIndicator != 0));
        truck.Set("retarderBrake", Napi::Number::New(env, data.truck_ui.retarderBrake));
        truck.Set("fuelWarningOn", Napi::Boolean::New(env, data.truck_b.fuelWarning != 0));
        truck.Set("adblueWarningOn", Napi::Boolean::New(env, data.truck_b.adblueWarning != 0));
        truck.Set("airPressureWarningOn", Napi::Boolean::New(env, data.truck_b.airPressureWarning != 0));
        truck.Set("airPressureEmergencyOn", Napi::Boolean::New(env, data.truck_b.airPressureEmergency != 0));
        truck.Set("oilPressureWarningOn", Napi::Boolean::New(env, data.truck_b.oilPressureWarning != 0));
        truck.Set("waterTemperatureWarningOn", Napi::Boolean::New(env, data.truck_b.waterTemperatureWarning != 0));
        truck.Set("batteryVoltageWarningOn", Napi::Boolean::New(env, data.truck_b.batteryVoltageWarning != 0));
        result.Set("truck", truck);

        Napi::Object nav = Napi::Object::New(env);
        nav.Set("estimatedDistance", Napi::Number::New(env, data.truck_f.routeDistance));
        nav.Set("estimatedTime", Napi::Number::New(env, data.truck_f.routeTime));
        nav.Set("speedLimit", Napi::Number::New(env, data.truck_f.speedLimit));
        result.Set("navigation", nav);

        Napi::Object trailer = Napi::Object::New(env);
        if (data.trailer.trailer && data.config_ui.maxTrailerCount > 0) {
            bool attached = data.trailer.trailer[0].com_b.attached != 0;
            trailer.Set("attached", Napi::Boolean::New(env, attached));
            trailer.Set("id", Napi::String::New(env, data.trailer.trailer[0].con_s.id));
            trailer.Set("name", Napi::String::New(env, data.trailer.trailer[0].con_s.name));
            trailer.Set("brand", Napi::String::New(env, data.trailer.trailer[0].con_s.brand));
            trailer.Set("brandId", Napi::String::New(env, data.trailer.trailer[0].con_s.brandId));
            trailer.Set("bodyType", Napi::String::New(env, data.trailer.trailer[0].con_s.bodyType));
            trailer.Set("licensePlate", Napi::String::New(env, data.trailer.trailer[0].con_s.licensePlate));
            trailer.Set("licensePlateCountry", Napi::String::New(env, data.trailer.trailer[0].con_s.licensePlateCountry));
            trailer.Set("wearChassis", Napi::Number::New(env, data.trailer.trailer[0].com_f.wearChassis));
            trailer.Set("wearWheels", Napi::Number::New(env, data.trailer.trailer[0].com_f.wearWheels));
            trailer.Set("wearBody", Napi::Number::New(env, data.trailer.trailer[0].com_f.wearBody));
            trailer.Set("cargoDamage", Napi::Number::New(env, data.trailer.trailer[0].com_f.cargoDamage));
        } else {
            trailer.Set("attached", Napi::Boolean::New(env, false));
        }
        result.Set("trailer", trailer);

        Napi::Object special = Napi::Object::New(env);
        special.Set("onJob", Napi::Boolean::New(env, data.special_b.onJob != 0));
        special.Set("jobFinished", Napi::Boolean::New(env, data.special_b.jobFinished != 0));
        special.Set("jobCancelled", Napi::Boolean::New(env, data.special_b.jobCancelled != 0));
        special.Set("jobDelivered", Napi::Boolean::New(env, data.special_b.jobDelivered != 0));
        special.Set("fined", Napi::Boolean::New(env, data.special_b.fined != 0));
        special.Set("tollgate", Napi::Boolean::New(env, data.special_b.tollgate != 0));
        special.Set("ferry", Napi::Boolean::New(env, data.special_b.ferry != 0));
        special.Set("train", Napi::Boolean::New(env, data.special_b.train != 0));
        special.Set("refuel", Napi::Boolean::New(env, data.special_b.refuel != 0));
        special.Set("refuelPayed", Napi::Boolean::New(env, data.special_b.refuelPayed != 0));
        result.Set("special", special);

        Napi::Object job = Napi::Object::New(env);
        job.Set("income", Napi::Number::New(env, (double)data.config_ull.jobIncome));
        job.Set("sourceCity", Napi::String::New(env, data.config_s.citySrc));
        job.Set("sourceCityId", Napi::String::New(env, data.config_s.citySrcId));
        job.Set("sourceCompany", Napi::String::New(env, data.config_s.compSrc));
        job.Set("sourceCompanyId", Napi::String::New(env, data.config_s.compSrcId));
        job.Set("destinationCity", Napi::String::New(env, data.config_s.cityDst));
        job.Set("destinationCityId", Napi::String::New(env, data.config_s.cityDstId));
        job.Set("destinationCompany", Napi::String::New(env, data.config_s.compDst));
        job.Set("destinationCompanyId", Napi::String::New(env, data.config_s.compDstId));
        job.Set("distance", Napi::Number::New(env, (double)data.config_ui.plannedDistanceKm * 1000.0));
        job.Set("cargoLoaded", Napi::Boolean::New(env, data.config_b.isCargoLoaded != 0));
        job.Set("specialJob", Napi::Boolean::New(env, data.config_b.specialJob != 0));
        job.Set("market", Napi::String::New(env, data.config_s.jobMarket));
        job.Set("cargoMass", Napi::Number::New(env, data.config_f.cargoMass));
        job.Set("unitCount", Napi::Number::New(env, data.config_ui.unitCount));
        job.Set("unitMass", Napi::Number::New(env, data.config_f.unitMass));
        Napi::Object cargo = Napi::Object::New(env);
        cargo.Set("id", Napi::String::New(env, data.config_s.cargoId));
        cargo.Set("name", Napi::String::New(env, data.config_s.cargo));
        job.Set("cargo", cargo);
        job.Set("deliveryTime", Napi::Number::New(env, (double)data.config_ui.time_abs_delivery));
        result.Set("job", job);

        Napi::Object controls = Napi::Object::New(env);
        Napi::Object input = Napi::Object::New(env);
        input.Set("steering", Napi::Number::New(env, data.truck_f.userSteer));
        input.Set("throttle", Napi::Number::New(env, data.truck_f.userThrottle));
        input.Set("brake", Napi::Number::New(env, data.truck_f.userBrake));
        input.Set("clutch", Napi::Number::New(env, data.truck_f.userClutch));
        controls.Set("input", input);
        Napi::Object gameControls = Napi::Object::New(env);
        gameControls.Set("steering", Napi::Number::New(env, data.truck_f.gameSteer));
        gameControls.Set("throttle", Napi::Number::New(env, data.truck_f.gameThrottle));
        gameControls.Set("brake", Napi::Number::New(env, data.truck_f.gameBrake));
        gameControls.Set("clutch", Napi::Number::New(env, data.truck_f.gameClutch));
        controls.Set("game", gameControls);
        result.Set("controls", controls);

        Napi::Object gameplay = Napi::Object::New(env);
        Napi::Object delivered = Napi::Object::New(env);
        delivered.Set("cargoDamage", Napi::Number::New(env, data.gameplay_f.jobDeliveredCargoDamage));
        delivered.Set("distanceKm", Napi::Number::New(env, data.gameplay_f.jobDeliveredDistanceKm));
        delivered.Set("earnedXp", Napi::Number::New(env, data.gameplay_i.jobDeliveredEarnedXp));
        delivered.Set("revenue", Napi::Number::New(env, (double)data.gameplay_ll.jobDeliveredRevenue));
        delivered.Set("autoLoaded", Napi::Boolean::New(env, data.gameplay_b.jobDeliveredAutoloadUsed != 0));
        delivered.Set("autoParked", Napi::Boolean::New(env, data.gameplay_b.jobDeliveredAutoparkUsed != 0));
        delivered.Set("deliveryTime", Napi::Number::New(env, data.gameplay_ui.jobDeliveredDeliveryTime));
        gameplay.Set("delivered", delivered);
        Napi::Object cancelled = Napi::Object::New(env);
        cancelled.Set("penalty", Napi::Number::New(env, (double)data.gameplay_ll.jobCancelledPenalty));
        gameplay.Set("cancelled", cancelled);
        Napi::Object fined = Napi::Object::New(env);
        fined.Set("amount", Napi::Number::New(env, (double)data.gameplay_ll.fineAmount));
        fined.Set("offence", Napi::String::New(env, data.gameplay_s.fineOffence));
        gameplay.Set("fined", fined);
        result.Set("gameplay", gameplay);

        Napi::Object raw = Napi::Object::New(env);
        raw.Set("timestamp", Napi::Number::New(env, (double)data.time));
        raw.Set("simulatedTime", Napi::Number::New(env, (double)data.simulatedTime));
        raw.Set("renderTime", Napi::Number::New(env, (double)data.renderTime));
        raw.Set("multiplayerTimeOffset", Napi::Number::New(env, (double)data.multiplayerTimeOffset));
        raw.Set("pluginRevision", Napi::Number::New(env, data.scs_values.telemetry_plugin_revision));
        raw.Set("gameVersion", Napi::String::New(env,
            std::to_string(data.scs_values.version_major) + "." +
            std::to_string(data.scs_values.version_minor)));
        raw.Set("telemetryMajor", Napi::Number::New(env, data.scs_values.telemetry_version_game_major));
        raw.Set("telemetryMinor", Napi::Number::New(env, data.scs_values.telemetry_version_game_minor));
        result.Set("raw", raw);

        Napi::Object shifter = Napi::Object::New(env);
        shifter.Set("type", Napi::String::New(env, data.config_s.shifterType));
        shifter.Set("slot", Napi::Number::New(env, data.truck_ui.shifterSlot));
        shifter.Set("selectorCount", Napi::Number::New(env, data.config_ui.selectorCount));
        shifter.Set("gearsForward", Napi::Number::New(env, data.config_ui.gears));
        shifter.Set("gearsReverse", Napi::Number::New(env, data.config_ui.gears_reverse));
        result.Set("shifter", shifter);

        Napi::Object timeObj = Napi::Object::New(env);
        timeObj.Set("gameTimeMinutes", Napi::Number::New(env, data.common_ui.time_abs));
        timeObj.Set("restStop", Napi::Number::New(env, data.common_i.restStop));
        result.Set("time", timeObj);

        return result;
    }

    Napi::Value ReadOnlyTimestamp(Napi::Env env) {
        if (!pData) return env.Undefined();
        return Napi::Number::New(env, (double)pData->time);
    }

    Napi::Value GetSdkActive(Napi::Env env) {
        if (!pData) return Napi::Boolean::New(env, false);
        return Napi::Boolean::New(env, pData->sdkActive != 0);
    }

    Napi::Value GetPaused(Napi::Env env) {
        if (!pData) return Napi::Boolean::New(env, true);
        return Napi::Boolean::New(env, pData->paused != 0);
    }
};

static Napi::FunctionReference constructor;

Napi::Value ReadTelemetry(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    TelemetryReader reader;
    if (!reader.Open()) {
        Napi::Object result = Napi::Object::New(env);
        result.Set("error", "Shared memory not available - is the game running with the plugin?");
        result.Set("errorCode", Napi::Number::New(env, GetLastError()));
        return result;
    }
    Napi::Object data = reader.Read(env);
    reader.Close();
    return data;
}

Napi::Value GetTelemetryStatus(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    TelemetryReader reader;
    Napi::Object result = Napi::Object::New(env);
    result.Set("available", Napi::Boolean::New(env, reader.Open()));
    if (reader.IsOpen()) {
        result.Set("sdkActive", reader.GetSdkActive(env));
        result.Set("paused", reader.GetPaused(env));
        result.Set("timestamp", reader.ReadOnlyTimestamp(env));
        reader.Close();
    } else {
        result.Set("sdkActive", Napi::Boolean::New(env, false));
        result.Set("paused", Napi::Boolean::New(env, true));
        result.Set("errorCode", Napi::Number::New(env, GetLastError()));
    }
    return result;
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "readTelemetry"),
        Napi::Function::New(env, ReadTelemetry));
    exports.Set(Napi::String::New(env, "getTelemetryStatus"),
        Napi::Function::New(env, GetTelemetryStatus));
    return exports;
}

NODE_API_MODULE(telemetry_addon, Init)
