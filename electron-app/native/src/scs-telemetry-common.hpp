#ifndef SCS_TELEMETRY_COMMON_HPP
#define SCS_TELEMETRY_COMMON_HPP

#include <cstdint>

#define PLUGIN_REVID 12
#define ETS2 1
#define ATS 2
#define UnknownGame 0
#define SCS_PLUGIN_MMF_NAME L"Local\\SCSTelemetry"
#define SCS_PLUGIN_MMF_SIZE (32*1024)
#define stringsize 64
#define WHEEL_SIZE 14
#define SUBSTANCE_SIZE 25

#pragma pack(push, 8)

typedef struct scsTrailer_s {
    struct { bool wheelSteerable[16], wheelSimulated[16], wheelPowered[16], wheelLiftable[16]; } con_b;
    struct { bool wheelOnGround[16], attached; } com_b;
    char buffer_b[3];
    struct { unsigned int wheelSubstance[16]; } com_ui;
    struct { unsigned int wheelCount; } con_ui;
    struct {
        float cargoDamage, wearChassis, wearWheels, wearBody;
        float wheelSuspDeflection[16], wheelVelocity[16], wheelSteering[16];
        float wheelRotation[16], wheelLift[16], wheelLiftOffset[16];
    } com_f;
    struct { float wheelRadius[16]; } con_f;
    struct {
        float linearVelocityX, linearVelocityY, linearVelocityZ;
        float angularVelocityX, angularVelocityY, angularVelocityZ;
        float linearAccelerationX, linearAccelerationY, linearAccelerationZ;
        float angularAccelerationX, angularAccelerationY, angularAccelerationZ;
    } com_fv;
    struct {
        float hookPositionX, hookPositionY, hookPositionZ;
        float wheelPositionX[16], wheelPositionY[16], wheelPositionZ[16];
    } con_fv;
    char buffer_fv[4];
    struct { double worldX, worldY, worldZ, rotationX, rotationY, rotationZ; } com_dp;
    struct {
        char id[stringsize], cargoAcessoryId[stringsize], bodyType[stringsize];
        char brandId[stringsize], brand[stringsize], name[stringsize];
        char chainType[stringsize], licensePlate[stringsize];
        char licensePlateCountry[stringsize], licensePlateCountryId[stringsize];
    } con_s;
} scsTrailer_t;

typedef struct scsTelemetryMap_s {
    bool sdkActive; char placeHolder[3];
    bool paused; char placeHolder2[3];
    unsigned long long time, simulatedTime, renderTime;
    long long multiplayerTimeOffset;

    struct {
        unsigned int telemetry_plugin_revision, version_major, version_minor;
        unsigned int game, telemetry_version_game_major, telemetry_version_game_minor;
    } scs_values;

    struct { unsigned int time_abs; } common_ui;

    struct {
        unsigned int gears, gears_reverse, retarderStepCount, truckWheelCount;
        unsigned int selectorCount, time_abs_delivery, maxTrailerCount;
        unsigned int unitCount, plannedDistanceKm;
    } config_ui;

    struct {
        unsigned int shifterSlot, retarderBrake, lightsAuxFront, lightsAuxRoof;
        unsigned int truck_wheelSubstance[16];
        unsigned int hshifterPosition[32], hshifterBitmask[32];
    } truck_ui;

    struct { unsigned int jobDeliveredDeliveryTime, jobStartingTime, jobFinishedTime; } gameplay_ui;
    char buffer_ui[48];

    struct { int restStop; } common_i;
    struct { int gear, gearDashboard; int hshifterResulting[32]; } truck_i;
    struct { int jobDeliveredEarnedXp; } gameplay_i;
    char buffer_i[56];

    struct { float scale; } common_f;
    struct {
        float fuelCapacity, fuelWarningFactor, adblueCapacity, adblueWarningFactor;
        float airPressureWarning, airPressurEmergency, oilPressureWarning;
        float waterTemperatureWarning, batteryVoltageWarning, engineRpmMax;
        float gearDifferential, cargoMass, truckWheelRadius[16];
        float gearRatiosForward[24], gearRatiosReverse[8], unitMass;
    } config_f;

    struct {
        float speed, engineRpm, userSteer, userThrottle, userBrake, userClutch;
        float gameSteer, gameThrottle, gameBrake, gameClutch, cruiseControlSpeed;
        float airPressure, brakeTemperature, fuel, fuelAvgConsumption, fuelRange;
        float adblue, oilPressure, oilTemperature, waterTemperature, batteryVoltage;
        float lightsDashboard, wearEngine, wearTransmission, wearCabin, wearChassis, wearWheels;
        float truckOdometer, routeDistance, routeTime, speedLimit;
        float truck_wheelSuspDeflection[16], truck_wheelVelocity[16], truck_wheelSteering[16];
        float truck_wheelRotation[16], truck_wheelLift[16], truck_wheelLiftOffset[16];
    } truck_f;

    struct {
        float jobDeliveredCargoDamage, jobDeliveredDistanceKm, refuelAmount;
    } gameplay_f;

    struct { float cargoDamage; } job_f;
    char buffer_f[28];

    struct {
        bool truckWheelSteerable[16], truckWheelSimulated[16];
        bool truckWheelPowered[16], truckWheelLiftable[16];
        bool isCargoLoaded, specialJob;
    } config_b;

    struct {
        bool parkBrake, motorBrake, airPressureWarning, airPressureEmergency;
        bool fuelWarning, adblueWarning, oilPressureWarning, waterTemperatureWarning;
        bool batteryVoltageWarning, electricEnabled, engineEnabled, wipers;
        bool blinkerLeftActive, blinkerRightActive, blinkerLeftOn, blinkerRightOn;
        bool lightsParking, lightsBeamLow, lightsBeamHigh, lightsBeacon;
        bool lightsBrake, lightsReverse, lightsHazard, cruiseControl;
        bool truck_wheelOnGround[16];
        bool shifterToggle[2];
        bool differentialLock, liftAxle, liftAxleIndicator;
        bool trailerLiftAxle, trailerLiftAxleIndicator;
    } truck_b;

    struct { bool jobDeliveredAutoparkUsed, jobDeliveredAutoloadUsed; } gameplay_b;
    char buffer_b[25];

    struct {
        float cabinPositionX, cabinPositionY, cabinPositionZ;
        float headPositionX, headPositionY, headPositionZ;
        float truckHookPositionX, truckHookPositionY, truckHookPositionZ;
        float truckWheelPositionX[16], truckWheelPositionY[16], truckWheelPositionZ[16];
    } config_fv;

    struct {
        float lv_accelerationX, lv_accelerationY, lv_accelerationZ;
        float av_accelerationX, av_accelerationY, av_accelerationZ;
        float accelerationX, accelerationY, accelerationZ;
        float aa_accelerationX, aa_accelerationY, aa_accelerationZ;
        float cabinAVX, cabinAVY, cabinAVZ;
        float cabinAAX, cabinAAY, cabinAAZ;
    } truck_fv;
    char buffer_fv[60];

    struct {
        float cabinOffsetX, cabinOffsetY, cabinOffsetZ;
        float cabinOffsetrotationX, cabinOffsetrotationY, cabinOffsetrotationZ;
        float headOffsetX, headOffsetY, headOffsetZ;
        float headOffsetrotationX, headOffsetrotationY, headOffsetrotationZ;
    } truck_fp;
    char buffer_fp[152];

    struct {
        double coordinateX, coordinateY, coordinateZ;
        double rotationX, rotationY, rotationZ;
    } truck_dp;
    char buffer_dp[52];

    struct {
        char truckBrandId[stringsize], truckBrand[stringsize], truckId[stringsize];
        char truckName[stringsize], cargoId[stringsize], cargo[stringsize];
        char cityDstId[stringsize], cityDst[stringsize], compDstId[stringsize];
        char compDst[stringsize], citySrcId[stringsize], citySrc[stringsize];
        char compSrcId[stringsize], compSrc[stringsize], shifterType[16];
        char truckLicensePlate[stringsize], truckLicensePlateCountryId[stringsize];
        char truckLicensePlateCountry[stringsize], jobMarket[32];
    } config_s;

    struct {
        char fineOffence[32];
        char ferrySourceName[stringsize], ferryTargetName[stringsize];
        char ferrySourceId[stringsize], ferryTargetId[stringsize];
        char trainSourceName[stringsize], trainTargetName[stringsize];
        char trainSourceId[stringsize], trainTargetId[stringsize];
    } gameplay_s;
    char buffer_s[20];

    struct { unsigned long long jobIncome; } config_ull;
    char buffer_ull[192];

    struct {
        long long jobCancelledPenalty, jobDeliveredRevenue, fineAmount;
        long long tollgatePayAmount, ferryPayAmount, trainPayAmount;
    } gameplay_ll;
    char buffer_ll[52];

    struct {
        bool onJob, jobFinished, jobCancelled, jobDelivered;
        bool fined, tollgate, ferry, train, refuel, refuelPayed;
    } special_b;
    char buffer_special[90];

    struct { char substance[SUBSTANCE_SIZE][stringsize]; } substances;

    struct { scsTrailer_t trailer[10]; } trailer;
} scsTelemetryMap_t;

#pragma pack(pop)

#endif
